(function () {
  "use strict";

  var cachedWalletAddress = sessionStorage.getItem("joltwork-wallet") || null;
  var walletAddress = null;
  var verifiedMetadataUri = null;
  var verifiedMetadata = null;
  var launchManifestReady = false;
  var intentManifestReady = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function hex(bytes) {
    return Array.from(bytes).map(function (value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  async function sha256(value) {
    var encoded = new TextEncoder().encode(value);
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoded)));
  }

  function unsignedInteger(value, field) {
    if (!/^\d+$/.test(value)) throw new Error(field + " must be an unsigned integer");
    return value;
  }

  function solanaAddress(value, field) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new Error(field + " must be a valid base58 Solana address");
    return value;
  }

  function metadataUri(value) {
    var parsed;
    try { parsed = new URL(value); } catch (error) { throw new Error("metadata uri must be a valid URL"); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("metadata uri must use http or https");
    return parsed.href;
  }

  var activeProvider = null;
  var boundProviders = [];
  var walletButton = byId("connect-wallet");
  window.JoltworkWallet = {
    getProvider: function () { return activeProvider; },
    getAddress: function () { return walletAddress; }
  };

  function walletLogo(name) {
    var icons = window.JOLT_OFFICIAL_WALLET_ICONS || {};
    return icons[name] || "";
  }

  function shortAddress(address) {
    return address ? address.slice(0, 5) + "…" + address.slice(-5) : "NOT CONNECTED";
  }

  function showToast(message, tone) {
    var toast = byId("site-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "site-toast";
      toast.className = "site-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "site-toast visible " + (tone || "");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove("visible"); }, 2600);
  }

  function setWalletAddress(address, providerObject) {
    walletAddress = address ? String(address) : null;
    activeProvider = providerObject || null;
    if (walletAddress) sessionStorage.setItem("joltwork-wallet", walletAddress);
    else sessionStorage.removeItem("joltwork-wallet");
    var label = walletButton && walletButton.querySelector(".rail-label");
    if (label) label.textContent = walletAddress ? shortAddress(walletAddress) : "CONNECT WALLET";
    document.querySelectorAll("[data-wallet-state]").forEach(function (item) {
      item.textContent = walletAddress ? shortAddress(walletAddress) : "not connected";
      item.classList.toggle("connected", Boolean(walletAddress));
    });
    var disconnect = byId("wallet-disconnect");
    if (disconnect) disconnect.hidden = !walletAddress;
    var launchSubmit = byId("launch-submit");
    if (launchSubmit) launchSubmit.disabled = !walletAddress || !launchManifestReady || verifiedMetadataUri !== (byId("coin-uri") && byId("coin-uri").value.trim());
    var intentSubmit = byId("intent-submit");
    if (intentSubmit) intentSubmit.disabled = !walletAddress || !intentManifestReady;
  }

  function detectedWallets() {
    var wallets = [];
    var seen = [];
    function add(name, wallet, install) {
      if (wallet && typeof wallet.connect === "function" && seen.indexOf(wallet) === -1) {
        seen.push(wallet);
        wallets.push({ name: name, provider: wallet, install: install, icon: walletLogo(name), detected: true });
      } else if (!wallet) wallets.push({ name: name, provider: null, install: install, icon: walletLogo(name), detected: false });
    }
    add("Phantom", window.phantom && window.phantom.solana, "https://phantom.com/download");
    add("Solflare", window.solflare, "https://www.solflare.com/download/");
    add("Backpack", (window.backpack && (window.backpack.solana || window.backpack)) || (window.xnft && window.xnft.solana), "https://backpack.app/download");
    if (window.solana && seen.indexOf(window.solana) === -1) add("Solana Wallet", window.solana, "https://solana.com/ecosystem/explore?categories=wallet");
    return wallets;
  }

  function bindWalletEvents(wallet) {
    if (!wallet || typeof wallet.on !== "function" || boundProviders.indexOf(wallet) !== -1) return;
    boundProviders.push(wallet);
    wallet.on("accountChanged", function (publicKey) {
      if (publicKey) setWalletAddress(publicKey, wallet);
      else setWalletAddress(null, null);
    });
    wallet.on("disconnect", function () { setWalletAddress(null, null); });
  }

  function ensureWalletModal() {
    if (byId("wallet-modal")) return;
    var modal = document.createElement("div");
    modal.id = "wallet-modal";
    modal.className = "wallet-modal";
    modal.hidden = true;
    modal.innerHTML = '<button class="wallet-backdrop" data-wallet-close aria-label="Close wallet dialog"></button>' +
      '<section class="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-title">' +
      '<div class="wallet-dialog-head"><div><span>SOLANA / SIGNING AUTHORITY</span><h2 id="wallet-title">Connect a wallet</h2></div><button class="wallet-close" data-wallet-close aria-label="Close">×</button></div>' +
      '<p>Select an injected wallet. Joltwork never requests a seed phrase or private key.</p>' +
      '<div id="wallet-options" class="wallet-options"></div>' +
      '<button id="wallet-disconnect" class="button wallet-disconnect" type="button">disconnect current wallet</button>' +
      '<small>Wallet marks are sourced from the official Solana Wallet Adapter packages. Only install wallets from their official websites and review every transaction before signing.</small>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-wallet-close]").forEach(function (item) {
      item.addEventListener("click", closeWalletModal);
    });
    byId("wallet-disconnect").addEventListener("click", disconnectWallet);
  }

  function renderWalletOptions() {
    var options = byId("wallet-options");
    if (!options) return;
    options.innerHTML = "";
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      var currentUrl = encodeURIComponent(window.location.href);
      var referrer = encodeURIComponent(window.location.origin);
      var mobileHelp = document.createElement("div");
      mobileHelp.className = "wallet-mobile-help";
      mobileHelp.innerHTML = '<b>Using a mobile browser?</b><p>Open Joltwork inside a wallet browser so the provider can be injected securely.</p>' +
        '<div><a href="https://phantom.com/ul/browse/' + currentUrl + '?ref=' + referrer + '">open in Phantom</a>' +
        '<a href="https://solflare.com/ul/v1/browse/' + currentUrl + '?ref=' + referrer + '">open in Solflare</a></div>';
      options.appendChild(mobileHelp);
    }
    detectedWallets().forEach(function (wallet) {
      var item;
      if (wallet.detected) {
        item = document.createElement("button");
        item.type = "button";
        item.className = "wallet-option";
        item.innerHTML = '<span class="wallet-badge">' + (wallet.icon ? '<img src="' + wallet.icon + '" alt="' + wallet.name + ' official logo">' : '<span aria-hidden="true">◆</span>') + '</span><span><b>' + wallet.name + '</b><small>detected in this browser</small></span><em>connect</em>';
        item.addEventListener("click", function () { connectWallet(wallet); });
      } else {
        item = document.createElement("a");
        item.className = "wallet-option muted";
        item.href = wallet.install;
        item.target = "_blank";
        item.rel = "noreferrer";
        item.innerHTML = '<span class="wallet-badge">' + (wallet.icon ? '<img src="' + wallet.icon + '" alt="' + wallet.name + ' official logo">' : '<span aria-hidden="true">◆</span>') + '</span><span><b>' + wallet.name + '</b><small>not detected</small></span><em>install ↗</em>';
      }
      options.appendChild(item);
    });
    byId("wallet-disconnect").hidden = !walletAddress;
  }

  function openWalletModal() {
    ensureWalletModal();
    renderWalletOptions();
    byId("wallet-modal").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeWalletModal() {
    var modal = byId("wallet-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function connectWallet(wallet) {
    try {
      var connection = await wallet.provider.connect();
      var publicKey = connection && connection.publicKey || wallet.provider.publicKey;
      if (!publicKey) throw new Error("Wallet returned no public key");
      bindWalletEvents(wallet.provider);
      setWalletAddress(publicKey, wallet.provider);
      closeWalletModal();
      showToast(wallet.name + " connected · " + shortAddress(String(publicKey)), "success");
    } catch (error) {
      showToast(error && error.message ? error.message : "Wallet connection declined", "error");
    }
  }

  async function disconnectWallet() {
    try {
      if (activeProvider && typeof activeProvider.disconnect === "function") await activeProvider.disconnect();
    } catch (error) { /* the local session must still be cleared */ }
    setWalletAddress(null, null);
    closeWalletModal();
    showToast("Wallet disconnected");
  }

  async function restoreTrustedWallet() {
    if (!cachedWalletAddress) return;
    var wallets = detectedWallets().filter(function (wallet) { return wallet.detected; });
    for (var index = 0; index < wallets.length; index += 1) {
      var wallet = wallets[index];
      try {
        var publicKey = wallet.provider.publicKey;
        if (!publicKey) {
          var connection = await wallet.provider.connect({ onlyIfTrusted: true });
          publicKey = connection && connection.publicKey || wallet.provider.publicKey;
        }
        if (publicKey && String(publicKey) === cachedWalletAddress) {
          bindWalletEvents(wallet.provider);
          setWalletAddress(publicKey, wallet.provider);
          return;
        }
      } catch (error) { /* not previously approved in this wallet */ }
    }
    sessionStorage.removeItem("joltwork-wallet");
    cachedWalletAddress = null;
  }

  if (walletButton) walletButton.addEventListener("click", openWalletModal);
  document.querySelectorAll("[data-wallet-connect]").forEach(function (button) {
    button.addEventListener("click", openWalletModal);
  });
  setWalletAddress(null, null);
  restoreTrustedWallet();

  var launchForm = byId("launch-form");
  var metadataCheck = byId("metadata-check");
  if (metadataCheck) metadataCheck.addEventListener("click", async function () {
    var state = byId("metadata-state");
    var preview = byId("coin-image-preview");
    metadataCheck.disabled = true;
    metadataCheck.textContent = "verifying…";
    verifiedMetadataUri = null;
    verifiedMetadata = null;
    launchManifestReady = false;
    try {
      var uri = metadataUri(byId("coin-uri").value.trim());
      if (uri.length > 200) throw new Error("Pump metadata URI must not exceed 200 characters");
      var response = await fetch(uri, { cache: "no-store" });
      if (!response.ok) throw new Error("metadata returned HTTP " + response.status);
      var metadata = await response.json();
      var name = byId("coin-name").value.trim();
      var symbol = byId("coin-symbol").value.trim().toUpperCase();
      if (metadata.name !== name || String(metadata.symbol || "").toUpperCase() !== symbol) throw new Error("metadata name and symbol must match the form");
      if (!metadata.description || !metadata.image) throw new Error("metadata must include description and image");
      var image = metadataUri(metadata.image);
      byId("coin-description").value = metadata.description;
      byId("coin-image").value = image;
      if (metadata.website) byId("coin-website").value = metadata.website;
      if (metadata.twitter) byId("coin-twitter").value = metadata.twitter;
      if (metadata.telegram) byId("coin-telegram").value = metadata.telegram;
      preview.src = image;
      preview.hidden = false;
      verifiedMetadataUri = uri;
      verifiedMetadata = metadata;
      state.textContent = "METADATA VERIFIED";
      state.classList.add("ready");
      showToast("Public metadata verified", "success");
    } catch (error) {
      state.textContent = "METADATA INVALID";
      state.classList.remove("ready");
      preview.hidden = true;
      showToast(error.message + " · the host must allow browser access", "error");
    } finally {
      metadataCheck.disabled = false;
      metadataCheck.textContent = "verify metadata";
      setWalletAddress(walletAddress, activeProvider);
    }
  });
  function invalidateMetadata() {
    verifiedMetadataUri = null;
    verifiedMetadata = null;
    launchManifestReady = false;
    if (byId("metadata-state")) { byId("metadata-state").textContent = "METADATA NOT VERIFIED"; byId("metadata-state").classList.remove("ready"); }
    setWalletAddress(walletAddress, activeProvider);
  }
  ["coin-uri", "coin-name", "coin-symbol"].forEach(function (id) {
    if (byId(id)) byId(id).addEventListener("input", invalidateMetadata);
  });
  if (launchForm) launchForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var output = byId("launch-output");
    var name = byId("coin-name").value.trim();
    var symbol = byId("coin-symbol").value.trim().toUpperCase();
    if (!name || name.length > 32) {
      output.textContent = "error · coin name must contain 1–32 characters";
      showToast("Check the coin name", "error");
      return;
    }
    if (!/^[A-Z0-9_$.-]{1,13}$/.test(symbol)) {
      output.textContent = "error · symbol must contain 1–13 supported characters";
      showToast("Check the token symbol", "error");
      return;
    }
    var uri;
    try { uri = metadataUri(byId("coin-uri").value.trim()); }
    catch (error) {
      output.textContent = "error · " + error.message;
      showToast(error.message, "error");
      return;
    }
    if (uri !== verifiedMetadataUri || !verifiedMetadata || verifiedMetadata.name !== name || String(verifiedMetadata.symbol || "").toUpperCase() !== symbol) {
      output.textContent = "error · verify the public metadata JSON before compiling";
      showToast("Verify metadata first", "error");
      return;
    }
    var manifest = {
      format: "JLM1",
      network: "solana-mainnet-beta",
      creator: walletAddress || "wallet-not-connected",
      coin: {
        name: name,
        symbol: symbol,
        metadataUri: uri,
        description: String(verifiedMetadata.description),
        image: metadataUri(verifiedMetadata.image),
        website: verifiedMetadata.website || "",
        twitter: verifiedMetadata.twitter || "",
        telegram: verifiedMetadata.telegram || "",
        tokenProgram: "Token-2022",
        decimals: 6
      },
      launch: {
        route: byId("coin-route").value,
        quoteAsset: byId("coin-quote").value,
        network: byId("coin-network") ? byId("coin-network").value : "solana-mainnet-beta"
      },
      defaultIntentPolicy: {
        type: byId("coin-policy").value,
        enforcement: "jolt-guard-route-wrapper"
      }
    };
    var canonical = JSON.stringify(manifest);
    output.textContent = JSON.stringify({
      launchManifestId: await sha256(canonical),
      manifest: manifest,
      transactionPlan: [
        "create Token-2022 mint and metadata",
        "create bonding curve or native market",
        "publish default Jolt intent policy",
        "bind trading interface to Jolt Guard"
      ],
      signingAuthority: walletAddress || "connect wallet before transaction assembly"
    }, null, 2);
    launchManifestReady = true;
    var launchSubmit = byId("launch-submit");
    if (launchSubmit) launchSubmit.disabled = !walletAddress;
    showToast("JLM1 launch manifest compiled", "success");
  });

  var launchSubmit = byId("launch-submit");
  if (launchSubmit) launchSubmit.addEventListener("click", async function () {
    var output = byId("launch-output");
    var provider = window.JoltworkWallet && window.JoltworkWallet.getProvider();
    var authority = window.JoltworkWallet && window.JoltworkWallet.getAddress();
    if (!provider || !authority) {
      openWalletModal();
      showToast("Connect a wallet before creating the coin", "error");
      return;
    }
    if (!launchManifestReady || verifiedMetadataUri !== byId("coin-uri").value.trim()) {
      showToast("Verify metadata and compile the launch plan first", "error");
      return;
    }
    if (!window.JoltworkLaunch || typeof window.JoltworkLaunch.createPumpCoin !== "function") {
      showToast("Pump transaction module is unavailable", "error");
      return;
    }
    var accepted = window.confirm("Create this coin on Solana mainnet through the official Pump program? Your wallet will show the transaction and network cost before signing.");
    if (!accepted) return;
    launchSubmit.disabled = true;
    launchSubmit.textContent = "waiting for wallet…";
    try {
      var result = await window.JoltworkLaunch.createPumpCoin({
        provider: provider,
        authority: authority,
        name: byId("coin-name").value.trim(),
        symbol: byId("coin-symbol").value.trim().toUpperCase(),
        uri: metadataUri(byId("coin-uri").value.trim()),
        rpcEndpoint: metadataUri(byId("coin-rpc").value.trim())
      });
      output.textContent = JSON.stringify({
        status: "confirmed",
        network: "solana-mainnet-beta",
        mint: result.mint,
        signature: result.signature,
        solscan: result.explorer,
        pump: result.pump,
        note: "The token is live on mainnet and its policy references Jolt Guard program 6HfEuWvEmargNraXeqCiqCZRJ223kGjxsCB7H9S3ENTY."
      }, null, 2);
      showToast("Coin creation confirmed on Solana", "success");
    } catch (error) {
      output.textContent = "creation error · " + (error && error.message ? error.message : String(error));
      showToast(error && error.message ? error.message : "Coin creation failed", "error");
    } finally {
      launchSubmit.disabled = false;
      launchSubmit.textContent = "create coin on mainnet";
    }
  });

  var latestIntentQuote = null;
  var intentQuoteButton = byId("intent-quote");
  if (intentQuoteButton) intentQuoteButton.addEventListener("click", async function () {
    var output = byId("intent-output");
    intentQuoteButton.disabled = true;
    intentQuoteButton.textContent = "requesting quote…";
    intentManifestReady = false;
    if (byId("intent-submit")) byId("intent-submit").disabled = true;
    try {
      var inputMint = solanaAddress(byId("intent-input-mint").value.trim(), "input mint");
      var outputMint = solanaAddress(byId("intent-output-mint").value.trim(), "output mint");
      if (inputMint === outputMint) throw new Error("input and output mint must be different");
      var amount = unsignedInteger(byId("intent-input").value.trim(), "input amount");
      if (amount === "0") throw new Error("input amount must be greater than zero");
      var slippage = Number(unsignedInteger(byId("intent-slippage").value.trim(), "slippage"));
      if (slippage < 1 || slippage > 5000) throw new Error("slippage must be between 1 and 5000 bps");
      var params = new URLSearchParams({
        inputMint: inputMint, outputMint: outputMint, amount: amount,
        slippageBps: String(slippage), swapMode: "ExactIn"
      });
      var quoteResponse = await fetch("https://api.jup.ag/swap/v2/order?" + params.toString(), { cache: "no-store" });
      if (!quoteResponse.ok) throw new Error("Jupiter quote failed with HTTP " + quoteResponse.status);
      var quote = await quoteResponse.json();
      if (!quote.outAmount || quote.errorCode) throw new Error(quote.errorMessage || quote.errorCode || "Jupiter could not build a quote");
      var minOutput = quote.otherAmountThreshold || (BigInt(quote.outAmount) * BigInt(10000 - slippage) / 10000n).toString();
      byId("intent-output-min").value = minOutput;
      var slotResponse = await fetch("https://solana-rpc.publicnode.com", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [{ commitment: "confirmed" }] })
      });
      var slotJson = await slotResponse.json();
      if (slotJson.result) byId("intent-expiry").value = String(Number(slotJson.result) + 150);
      latestIntentQuote = {
        requestId: quote.requestId || null, router: quote.router || "metis",
        inputMint: inputMint, outputMint: outputMint, inAmount: quote.inAmount,
        outAmount: quote.outAmount, minimumOutput: minOutput, slippageBps: slippage,
        priceImpactPct: quote.priceImpactPct || quote.priceImpact || null,
        route: (quote.routePlan || []).map(function (step) { return step.swapInfo && step.swapInfo.label || "unknown"; })
      };
      output.textContent = JSON.stringify({ status: "live quote received", quote: latestIntentQuote, next: "review constraints, then compile intent" }, null, 2);
      showToast("Live Jupiter quote received", "success");
    } catch (error) {
      latestIntentQuote = null;
      output.textContent = "quote error · " + error.message;
      showToast(error.message, "error");
    } finally {
      intentQuoteButton.disabled = false;
      intentQuoteButton.textContent = "get live quote";
    }
  });

  var intentForm = byId("intent-form");
  if (intentForm) intentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var output = byId("intent-output");
    try {
      var manifest = {
        protocol: "jolt-guard-v1",
        network: "solana-mainnet-beta",
        authority: walletAddress || "wallet-not-connected",
        routeProgram: solanaAddress(byId("intent-route").value.trim(), "route program"),
        inputMint: solanaAddress(byId("intent-input-mint").value.trim(), "input mint"),
        outputMint: solanaAddress(byId("intent-output-mint").value.trim(), "output mint"),
        maxInput: unsignedInteger(byId("intent-input").value.trim(), "maximum input"),
        minOutput: unsignedInteger(byId("intent-output-min").value.trim(), "minimum output"),
        slippageBps: unsignedInteger(byId("intent-slippage").value.trim(), "slippage"),
        expiresAtSlot: unsignedInteger(byId("intent-expiry").value.trim(), "expiry slot"),
        policy: byId("intent-policy").value
      };
      if (!latestIntentQuote || latestIntentQuote.inputMint !== manifest.inputMint || latestIntentQuote.outputMint !== manifest.outputMint || latestIntentQuote.inAmount !== manifest.maxInput || latestIntentQuote.minimumOutput !== manifest.minOutput || String(latestIntentQuote.slippageBps) !== manifest.slippageBps) {
        throw new Error("request a fresh quote after changing the trade fields");
      }
      output.textContent = JSON.stringify({
        intentId: await sha256(JSON.stringify(manifest)),
        constraints: manifest,
        quote: latestIntentQuote,
        execution: [
          "snapshot source and destination token accounts",
          "invoke PRE policy hook",
          "invoke route through CPI",
          "reload balances and enforce postconditions",
          "return JRC1 receipt or revert transaction"
        ]
      }, null, 2);
      intentManifestReady = true;
      if (byId("intent-submit")) byId("intent-submit").disabled = !walletAddress;
      showToast("JOLT V1 intent compiled", "success");
    } catch (error) {
      output.textContent = "error · " + error.message;
      showToast(error.message, "error");
    }
  });

  var intentSubmit = byId("intent-submit");
  if (intentSubmit) intentSubmit.addEventListener("click", async function () {
    var output = byId("intent-output");
    var provider = window.JoltworkWallet && window.JoltworkWallet.getProvider();
    var authority = window.JoltworkWallet && window.JoltworkWallet.getAddress();
    if (!provider || !authority) return openWalletModal();
    if (!intentManifestReady || !latestIntentQuote) return showToast("Get a fresh quote and compile the intent first", "error");
    if (!window.JoltworkIntent || typeof window.JoltworkIntent.submitProtectedSwap !== "function") return showToast("Protected swap module is unavailable", "error");
    if (!window.confirm("Sign a mainnet swap protected by Jolt Guard? Review the token amounts and network fee in your wallet.")) return;
    intentSubmit.disabled = true;
    intentSubmit.textContent = "building protected swap…";
    try {
      var result = await window.JoltworkIntent.submitProtectedSwap({
        provider: provider, authority: authority,
        inputMint: byId("intent-input-mint").value.trim(), outputMint: byId("intent-output-mint").value.trim(),
        amount: byId("intent-input").value.trim(), minimumOutput: byId("intent-output-min").value.trim(),
        slippageBps: byId("intent-slippage").value.trim(), expiresAtSlot: byId("intent-expiry").value.trim()
      });
      output.textContent = JSON.stringify({ status: "confirmed", protection: "Jolt Guard mainnet", programId: "6HfEuWvEmargNraXeqCiqCZRJ223kGjxsCB7H9S3ENTY", intentId: result.intentId, signature: result.signature, explorer: result.explorer }, null, 2);
      showToast("Protected swap confirmed", "success");
    } catch (error) {
      output.textContent = "protected swap error · " + (error && error.message ? error.message : String(error));
      showToast(error && error.message ? error.message : "Protected swap failed", "error");
    } finally {
      intentManifestReady = false;
      intentSubmit.disabled = true;
      intentSubmit.textContent = "sign protected swap";
    }
  });

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var text = byId(button.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(text);
        var previous = button.textContent;
        button.textContent = "copied";
        showToast("Copied to clipboard", "success");
        setTimeout(function () { button.textContent = previous; }, 1200);
      } catch (error) {
        button.textContent = "select text";
      }
    });
  });

  document.querySelectorAll("[data-download]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = byId(button.dataset.download);
      if (!target || !target.textContent.trim().startsWith("{")) return;
      var blob = new Blob([target.textContent], { type: "application/json" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = button.dataset.filename || "joltwork-manifest.json";
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("JSON manifest downloaded", "success");
    });
  });

  var sourceBase = "https://raw.githubusercontent.com/dellmodrun/Joltwork/main/";
  var githubBase = "https://github.com/dellmodrun/Joltwork/blob/main/";
  var codeFiles = {};
  var codePaths = {
    program: "programs/jolt-guard/src/lib.rs",
    cargo: "programs/jolt-guard/Cargo.toml",
    sdkIndex: "sdk/src/index.ts",
    sdkConstants: "sdk/src/constants.ts",
    sdkTypes: "sdk/src/types.ts",
    sdkCodec: "sdk/src/codec.ts",
    sdkInstruction: "sdk/src/instruction.ts",
    sdkReceipt: "sdk/src/receipt.ts",
    jupiter: "sdk/src/adapters/jupiter.ts",
    codecTest: "sdk/test/codec.test.js",
    instructionTest: "sdk/test/instruction.test.js",
    jupiterTest: "sdk/test/jupiter.test.js",
    receiptTest: "sdk/test/receipt.test.js",
    launchClient: "launch-client.ts",
    intentClient: "intent-client.ts",
    appClient: "app.js",
    buildClient: "build-client.mjs",
    webPackage: "package.json",
    sdkPackage: "sdk/package.json",
    deployment: "deployments/devnet.json",
    mainnetDeployment: "deployments/mainnet.json",
    verifyDeployment: "scripts/verify-deployment.mjs",
    checkSite: "scripts/check-site.mjs",
    protocolCi: ".github/workflows/protocol-ci.yml",
    sbfCi: ".github/workflows/sbf-build.yml",
    koraCi: ".github/workflows/kora-deploy-tool.yml",
    readme: "README.md",
    architecture: "docs/ARCHITECTURE.md",
    integration: "docs/INTEGRATION.md",
    security: "docs/SECURITY.md",
    operations: "docs/OPERATIONS.md",
    spec: "JOLT_GUARD.md",
    contributing: "CONTRIBUTING.md"
  };

  function renderSource(text) {
    var view = byId("code-view");
    if (!view) return;
    view.textContent = "";
    var list = document.createElement("ol");
    list.className = "code-lines";
    text.replace(/\r\n/g, "\n").split("\n").forEach(function (line) {
      var item = document.createElement("li");
      var code = document.createElement("code");
      code.textContent = line || " ";
      item.appendChild(code);
      list.appendChild(item);
    });
    view.appendChild(list);
  }

  function setCodeLinks(path) {
    if (byId("code-raw")) byId("code-raw").href = sourceBase + path;
    if (byId("code-github")) byId("code-github").href = githubBase + path;
  }

  async function showCode(key, button) {
    if (!byId("code-view") || !byId("code-path")) return;
    var path = codePaths[key];
    byId("code-path").textContent = path;
    byId("code-view").textContent = "loading complete source…";
    if (byId("code-meta")) byId("code-meta").textContent = "loading source…";
    setCodeLinks(path);
    document.querySelectorAll("[data-code]").forEach(function (item) {
      item.classList.toggle("active", item === button);
    });
    try {
      if (!codeFiles[key]) {
        var response = await fetch(sourceBase + path, { cache: "no-store" });
        if (!response.ok) throw new Error("source request failed");
        codeFiles[key] = await response.text();
      }
      var text = codeFiles[key];
      renderSource(text);
      var lines = text.replace(/\r\n/g, "\n").split("\n").length;
      var bytes = new Blob([text]).size;
      if (byId("code-meta")) byId("code-meta").textContent = lines + " lines · " + bytes.toLocaleString() + " bytes · main";
    } catch (error) {
      byId("code-view").textContent = "The live source could not be loaded in this browser.\n\nOpen the same file in GitHub:\nhttps://github.com/dellmodrun/Joltwork/blob/main/" + path;
      if (byId("code-meta")) byId("code-meta").textContent = "source unavailable · open GitHub";
    }
  }

  document.querySelectorAll("[data-code]").forEach(function (button) {
    button.addEventListener("click", function () {
      showCode(button.dataset.code, button);
    });
  });
  if (byId("code-view")) showCode("program", document.querySelector('[data-code="program"]'));

  if (byId("code-filter")) byId("code-filter").addEventListener("input", function () {
    var query = byId("code-filter").value.trim().toLowerCase();
    var visible = 0;
    document.querySelectorAll(".code-group").forEach(function (group) {
      var groupVisible = 0;
      group.querySelectorAll("[data-code]").forEach(function (button) {
        var match = !query || button.textContent.toLowerCase().includes(query);
        button.hidden = !match;
        if (match) { groupVisible += 1; visible += 1; }
      });
      group.hidden = groupVisible === 0;
    });
    if (byId("code-file-count")) byId("code-file-count").textContent = visible + (visible === 1 ? " FILE" : " FILES");
  });

  if (byId("code-copy")) byId("code-copy").addEventListener("click", async function () {
    var active = document.querySelector("[data-code].active");
    var text = active ? codeFiles[active.dataset.code] : "";
    if (!text) return showToast("Wait for the source file to load", "warn");
    try {
      await navigator.clipboard.writeText(text);
      byId("code-copy").textContent = "COPIED";
      setTimeout(function () { byId("code-copy").textContent = "COPY"; }, 1200);
    } catch (error) {
      showToast("Clipboard access was blocked", "warn");
    }
  });

  var menuButton = byId("menu-toggle");
  if (menuButton) menuButton.addEventListener("click", function () {
    document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", document.body.classList.contains("menu-open") ? "true" : "false");
  });

  document.querySelectorAll(".site-rail a").forEach(function (link) {
    link.addEventListener("click", function () { document.body.classList.remove("menu-open"); });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeWalletModal();
      document.body.classList.remove("menu-open");
    }
  });
}());

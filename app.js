(function () {
  "use strict";

  var cachedWalletAddress = sessionStorage.getItem("joltwork-wallet") || null;
  var walletAddress = null;

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
    var launchOutput = byId("launch-output");
    if (launchSubmit && launchOutput && launchOutput.textContent.trim().startsWith("{")) {
      launchSubmit.disabled = !walletAddress;
    }
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
    var manifest = {
      format: "JLM1",
      network: "solana-mainnet-beta",
      creator: walletAddress || "wallet-not-connected",
      coin: {
        name: name,
        symbol: symbol,
        metadataUri: uri,
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
        note: "The Joltwork intent policy remains a manifest until the Jolt Guard Program ID is deployed."
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

  var intentForm = byId("intent-form");
  if (intentForm) intentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var output = byId("intent-output");
    try {
      var manifest = {
        protocol: "jolt-guard-v1",
        authority: walletAddress || "wallet-not-connected",
        routeProgram: solanaAddress(byId("intent-route").value.trim(), "route program"),
        maxInput: unsignedInteger(byId("intent-input").value.trim(), "maximum input"),
        minOutput: unsignedInteger(byId("intent-output-min").value.trim(), "minimum output"),
        expiresAtSlot: unsignedInteger(byId("intent-expiry").value.trim(), "expiry slot"),
        policy: byId("intent-policy").value
      };
      output.textContent = JSON.stringify({
        intentId: await sha256(JSON.stringify(manifest)),
        constraints: manifest,
        execution: [
          "snapshot source and destination token accounts",
          "invoke PRE policy hook",
          "invoke route through CPI",
          "reload balances and enforce postconditions",
          "return JRC1 receipt or revert transaction"
        ]
      }, null, 2);
      showToast("JOLT V1 intent compiled", "success");
    } catch (error) {
      output.textContent = "error · " + error.message;
      showToast(error.message, "error");
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
  var codeFiles = {};
  var codePaths = {
    program: "programs/jolt-guard/src/lib.rs",
    cargo: "programs/jolt-guard/Cargo.toml",
    sdk: "sdk/src/index.ts",
    tests: "sdk/test/codec.test.js",
    package: "sdk/package.json",
    launchClient: "launch-client.ts",
    webPackage: "package.json",
    buildClient: "build-client.mjs",
    spec: "JOLT_GUARD.md",
    readme: "README.md",
    ci: ".github/workflows/protocol-ci.yml"
  };

  async function showCode(key, button) {
    if (!byId("code-view") || !byId("code-path")) return;
    var path = codePaths[key];
    byId("code-path").textContent = path;
    byId("code-view").textContent = "loading complete source…";
    document.querySelectorAll("[data-code]").forEach(function (item) {
      item.classList.toggle("active", item === button);
    });
    try {
      if (!codeFiles[key]) {
        var response = await fetch(sourceBase + path, { cache: "no-store" });
        if (!response.ok) throw new Error("source request failed");
        codeFiles[key] = await response.text();
      }
      byId("code-view").textContent = codeFiles[key];
    } catch (error) {
      byId("code-view").textContent = "The live source could not be loaded in this browser.\n\nOpen the same file in GitHub:\nhttps://github.com/dellmodrun/Joltwork/blob/main/" + path;
    }
  }

  document.querySelectorAll("[data-code]").forEach(function (button) {
    button.addEventListener("click", function () {
      showCode(button.dataset.code, button);
    });
  });
  if (byId("code-view")) showCode("program", document.querySelector('[data-code="program"]'));

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

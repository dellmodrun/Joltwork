(function () {
  "use strict";

  var walletAddress = sessionStorage.getItem("joltwork-wallet") || null;

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

  function walletLogo(name) {
    var icons = {
      Phantom: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#ab9ff2"/><path fill="#fff" d="M32.5 19.2c0 7.7-5.8 13.5-13.6 13.5-5.6 0-10.3-3-12.4-7.4-.3-.6.2-1.3.9-1.3h4.1c.6 0 1.1-.4 1.2-1l.5-2.2c.1-.6.7-1 1.3-1h.9c.7 0 1.2.6 1.1 1.3l-.4 2.1c-.1.5.3.9.8.9h1.4c.6 0 1.1-.4 1.2-1l.5-2.2c.1-.6.7-1 1.3-1h.9c.7 0 1.2.6 1.1 1.3l-.4 2.1c-.1.5.3.9.8.9 3.2-.1 5.8-2.7 5.8-5.9 0-5.1-4.2-9.3-9.4-9.3-4.9 0-9 3.7-9.4 8.5-.1.7-.6 1.2-1.3 1.2H7.6c-.7 0-1.2-.6-1.2-1.3C7 10.5 12.8 5 20.1 5c6.9 0 12.4 5.7 12.4 14.2Z"/></svg>',
      Solflare: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#111"/><path fill="#fc9d18" d="m20 5 4 8 9-2-5 8 7 6-10 1-1 9-6-7-8 5 2-10-8-4 9-4-1-9 8 7Z"/><circle cx="20" cy="20" r="6" fill="#ffd36a"/></svg>',
      Backpack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#e33e2f"/><path fill="#fff" d="M14 11a6 6 0 0 1 12 0v2h2.5a3.5 3.5 0 0 1 3.5 3.5V31H8V16.5a3.5 3.5 0 0 1 3.5-3.5H14v-2Zm3 2h6v-2a3 3 0 0 0-6 0v2Zm-4 5v8h14v-8H13Z"/></svg>',
      "Solana Wallet": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#111"/><path fill="#14f195" d="M11 10h22l-4 5H7l4-5Zm-4 9h22l4 5H11l-4-5Zm4 9h22l-4 5H7l4-5Z"/></svg>'
    };
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(icons[name] || icons["Solana Wallet"]);
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
      '<small>Only install wallets from their official websites. Review every transaction before signing.</small>' +
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
        item.innerHTML = '<span class="wallet-badge"><img src="' + wallet.icon + '" alt=""></span><span><b>' + wallet.name + '</b><small>detected in this browser</small></span><em>connect</em>';
        item.addEventListener("click", function () { connectWallet(wallet); });
      } else {
        item = document.createElement("a");
        item.className = "wallet-option muted";
        item.href = wallet.install;
        item.target = "_blank";
        item.rel = "noreferrer";
        item.innerHTML = '<span class="wallet-badge"><img src="' + wallet.icon + '" alt=""></span><span><b>' + wallet.name + '</b><small>not detected</small></span><em>install ↗</em>';
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

  if (walletButton) walletButton.addEventListener("click", openWalletModal);
  document.querySelectorAll("[data-wallet-connect]").forEach(function (button) {
    button.addEventListener("click", openWalletModal);
  });
  setWalletAddress(walletAddress, null);

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
    showToast("JLM1 launch manifest compiled", "success");
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

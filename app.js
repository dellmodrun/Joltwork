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

  function provider() {
    return (window.phantom && window.phantom.solana) || window.solana || null;
  }

  var walletButton = byId("connect-wallet");
  if (walletButton && walletAddress) {
    var savedLabel = walletButton.querySelector(".rail-label");
    if (savedLabel) savedLabel.textContent = walletAddress.slice(0, 5) + "…" + walletAddress.slice(-5);
  }
  if (walletButton) walletButton.addEventListener("click", async function () {
    var button = this;
    var wallet = provider();
    if (!wallet || typeof wallet.connect !== "function") {
      var missingLabel = button.querySelector(".rail-label");
      if (missingLabel) missingLabel.textContent = "WALLET NOT DETECTED";
      return;
    }
    try {
      var connection = await wallet.connect();
      walletAddress = String(connection.publicKey || wallet.publicKey);
      sessionStorage.setItem("joltwork-wallet", walletAddress);
      var label = button.querySelector(".rail-label");
      if (label) label.textContent = walletAddress.slice(0, 5) + "…" + walletAddress.slice(-5);
    } catch (error) {
      var declinedLabel = button.querySelector(".rail-label");
      if (declinedLabel) declinedLabel.textContent = "CONNECTION DECLINED";
    }
  });

  var launchForm = byId("launch-form");
  if (launchForm) launchForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var output = byId("launch-output");
    var manifest = {
      format: "JLM1",
      network: "solana-mainnet-beta",
      creator: walletAddress || "wallet-not-connected",
      coin: {
        name: byId("coin-name").value.trim(),
        symbol: byId("coin-symbol").value.trim().toUpperCase(),
        metadataUri: byId("coin-uri").value.trim(),
        tokenProgram: "Token-2022",
        decimals: 6
      },
      launch: {
        route: byId("coin-route").value,
        quoteAsset: byId("coin-quote").value,
        holderRewards: byId("coin-rewards").value === "true"
      },
      defaultIntentPolicy: {
        type: byId("coin-policy").value,
        enforcement: "jolt-guard-route-wrapper"
      }
    };
    if (!manifest.coin.name || !manifest.coin.symbol || !manifest.coin.metadataUri) {
      output.textContent = "error · name, symbol and metadata uri are required";
      return;
    }
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
  });

  var intentForm = byId("intent-form");
  if (intentForm) intentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var output = byId("intent-output");
    try {
      var manifest = {
        protocol: "jolt-guard-v1",
        authority: walletAddress || "wallet-not-connected",
        routeProgram: byId("intent-route").value.trim(),
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
    } catch (error) {
      output.textContent = "error · " + error.message;
    }
  });

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    button.addEventListener("click", async function () {
      var text = byId(button.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(text);
        var previous = button.textContent;
        button.textContent = "copied";
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
    });
  });

  var codeFiles = {
    program: [
      "let source_before = token_amount(source)?;",
      "let destination_before = token_amount(destination)?;",
      "",
      "indexed_cpi(",
      "    route_program,",
      "    accounts,",
      "    &intent.route_indices,",
      "    intent.route_data.clone(),",
      ")?;",
      "",
      "let source_spent = source_before",
      "    .checked_sub(token_amount(source)?)?;",
      "let destination_received = token_amount(destination)?",
      "    .checked_sub(destination_before)?;",
      "",
      "if source_spent > intent.max_input {",
      "    return Err(custom(MAX_INPUT));",
      "}",
      "if destination_received < intent.min_output {",
      "    return Err(custom(MIN_OUTPUT));",
      "}"
    ].join("\n"),
    sdk: [
      "export function buildExecuteIntentInstruction(args) {",
      "  const { shared, routeIndices, hookIndices } =",
      "    dedupeSharedAccounts(args.routeAccounts, args.hookAccounts);",
      "",
      "  return {",
      "    programAddress: args.programAddress,",
      "    accounts: fixedAccounts.concat(shared),",
      "    data: encodeExecuteIntent({",
      "      constraints: args.constraints,",
      "      routeIndices,",
      "      hookIndices,",
      "      routeData: args.routeData",
      "    })",
      "  };",
      "}"
    ].join("\n"),
    spec: [
      "JOLT GUARD / EXECUTION",
      "",
      "1. verify authority, expiry and program accounts",
      "2. read source and destination token balances",
      "3. invoke policy hook with phase PRE",
      "4. invoke the selected route through CPI",
      "5. reload balances and calculate integer deltas",
      "6. reject max-input or min-output violations",
      "7. invoke policy hook with phase POST",
      "8. return JRC1 settlement proof"
    ].join("\n"),
    ci: [
      "protocol-ci",
      "",
      "rust:",
      "  cargo test --manifest-path programs/jolt-guard/Cargo.toml",
      "",
      "sdk:",
      "  npm ci",
      "  npm test",
      "",
      "latest result: PASS"
    ].join("\n")
  };

  var codePaths = {
    program: "programs/jolt-guard/src/lib.rs",
    sdk: "sdk/src/index.ts",
    spec: "JOLT_GUARD.md",
    ci: ".github/workflows/protocol-ci.yml"
  };

  function showCode(key, button) {
    if (!byId("code-view") || !byId("code-path")) return;
    byId("code-view").textContent = codeFiles[key];
    byId("code-path").textContent = codePaths[key];
    document.querySelectorAll("[data-code]").forEach(function (item) {
      item.classList.toggle("active", item === button);
    });
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
}());

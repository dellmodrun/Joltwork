(function () {
  "use strict";

  var RPC_URLS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet.solana.com"
  ];
  var NL = String.fromCharCode(10);
  var latestReceipt = null;

  function mountProductDepth() {
    var main = document.createElement("main");
    main.className = "col";
    main.innerHTML = `
      <div class="sections">
        <section>
          <h2>on the live surface</h2>
          <div class="body">
            <p>the public Joltwork interface turns a Solana signature into a portable settlement record. it reconstructs token deltas from confirmed pre- and post-balances, exposes every invoked program visible to RPC, records execution status, network fee and compute consumption, and keeps the evidence beside the interpretation.</p>
            <p>two adjacent instruments widen the investigation. address activity summarizes recent execution history for a wallet or program; mint inspector resolves program ownership, supply precision, authorities and parsed extensions. together they form a working path from market identity to transaction-level settlement.</p>
          </div>
          <table class="surface-table">
            <thead><tr><th>surface</th><th>input</th><th>evidence returned</th><th>state</th></tr></thead>
            <tbody>
              <tr><td>settlement analyzer</td><td>transaction signature</td><td>slot, status, fee, compute, token deltas, programs, JSON receipt</td><td>LIVE</td></tr>
              <tr><td>address activity</td><td>wallet or program</td><td>20 recent signatures, success ratio and observed slot range</td><td>LIVE</td></tr>
              <tr><td>mint inspector</td><td>SPL mint</td><td>owner program, decimals, supply, authorities and extensions</td><td>LIVE</td></tr>
              <tr><td>receipt archive</td><td>completed analysis</td><td>local history, clipboard copy and downloadable JSON</td><td>LIVE</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2>on the execution lifecycle</h2>
          <div class="body"><p>commercial settlement intelligence preserves the sequence from user intent to finalized evidence. Joltwork separates the interface promise, the path executed by Solana programs and the balances that ultimately settled.</p></div>
          <figure class="paper-figure">
            <div class="figure-frame">
              <svg viewBox="0 0 680 330" role="img" aria-label="Joltwork execution lifecycle">
                <defs><marker id="life-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#9b9a95"/></marker></defs>
                <g fill="none" stroke="#565550">
                  <rect x="20" y="40" width="112" height="74"/><rect x="152" y="40" width="112" height="74"/><rect x="284" y="40" width="112" height="74"/><rect x="416" y="40" width="112" height="74"/><rect x="548" y="40" width="112" height="74"/>
                  <path d="M132 77H142M264 77H274M396 77H406M528 77H538" marker-end="url(#life-arrow)"/>
                  <path d="M76 114V176H604V124" stroke-dasharray="3 4"/><rect x="76" y="176" width="528" height="92"/><path d="M340 268V300" marker-end="url(#life-arrow)"/>
                </g>
                <g fill="#fff" font-family="JetBrains Mono,monospace" font-size="9" text-anchor="middle">
                  <text x="76" y="70">INTENT</text><text x="76" y="91" fill="#9b9a95">wallet request</text>
                  <text x="208" y="70">MESSAGE</text><text x="208" y="91" fill="#9b9a95">accounts + ix</text>
                  <text x="340" y="70">CPI GRAPH</text><text x="340" y="91" fill="#9b9a95">program path</text>
                  <text x="472" y="70">SETTLEMENT</text><text x="472" y="91" fill="#9b9a95">balance ledger</text>
                  <text x="604" y="70">RECEIPT</text><text x="604" y="91" fill="#9b9a95">portable proof</text>
                  <text x="340" y="208" font-size="13" font-family="EB Garamond,serif">reconciliation boundary</text>
                  <text x="340" y="232" fill="#9b9a95">declared cost + attributed movement + unresolved remainder</text>
                  <text x="340" y="320">REPRODUCIBLE FROM SIGNATURE + SLOT</text>
                </g>
              </svg>
            </div>
            <figcaption>figure 4. the receipt is derived at the boundary between declared intent and confirmed balance evidence.</figcaption>
          </figure>
        </section>
        <section>
          <h2>on commercial discipline</h2>
          <div class="body"><p>Joltwork treats explainability as an accounting property. a result is useful only when it can be reproduced, exported and inspected without trusting a hidden score. the live interface asks for no wallet connection, signing authority or private key.</p></div>
          <div class="principles">
            <div class="principle"><b>01 / PROVENANCE</b><p>each result remains anchored to a signature, slot, account state and RPC response.</p></div>
            <div class="principle"><b>02 / DETERMINISM</b><p>raw token quantities are reconciled as integers before decimal presentation.</p></div>
            <div class="principle"><b>03 / PORTABILITY</b><p>receipts can be copied or downloaded as machine-readable JSON.</p></div>
            <div class="principle"><b>04 / PRIVACY</b><p>analysis requires no wallet connection, login, cookie or private key.</p></div>
            <div class="principle"><b>05 / FAILURE VISIBILITY</b><p>timeouts, missing transactions and RPC errors surface directly in context.</p></div>
            <div class="principle"><b>06 / EXTENSIBILITY</b><p>the evidence model accommodates SPL Token, Token-2022 and custom CPI paths.</p></div>
          </div>
        </section>
        <section>
          <h2>on receipt anatomy</h2>
          <div class="body">
            <p>a Joltwork receipt is both a human explanation and a machine-readable record. identity fields bind it to the network and transaction; execution fields preserve status, fee and compute consumption; accounting fields enumerate non-zero token deltas; attribution fields identify the programs that participated in settlement.</p>
            <p>the browser exposes the exact JSON beside the visual summary so an analyst can move from a headline result to the underlying record without changing tools. exported receipts can be compared across routes, archived with treasury records or attached to an incident report.</p>
          </div>
          <pre class="schema-block">{
  "product": "Joltwork Settlement Receipt",
  "network": "solana-mainnet-beta",
  "signature": "&lt;base58 signature&gt;",
  "slot": 000000000,
  "status": "confirmed",
  "feeLamports": 5000,
  "computeUnitsConsumed": 21498,
  "tokenBalanceDeltas": [
    { "owner": "...", "mint": "...", "delta": "-12.500000" }
  ],
  "invokedPrograms": ["..."],
  "generatedAt": "ISO-8601"
}</pre>
        </section>
        <section>
          <h2>on economic attribution</h2>
          <div class="body">
            <p>one transaction may contain several economically different movements. Joltwork separates the amount delivered to the destination from network cost, program-mediated exchange, token-level mechanics and the remainder that cannot yet be assigned to a known rule.</p>
            <p>this separation is essential on Solana because an apparently simple swap may cross a router, an automated market maker, one or more token programs and arbitrary CPI participants before the final balances are recorded.</p>
          </div>
          <figure class="paper-figure">
            <div class="figure-frame">
              <svg viewBox="0 0 680 340" role="img" aria-label="Economic attribution ledger">
                <g fill="none" stroke="#565550"><rect x="30" y="34" width="620" height="42"/><rect x="30" y="92" width="500" height="42"/><rect x="30" y="150" width="410" height="42"/><rect x="30" y="208" width="300" height="42"/><rect x="30" y="266" width="188" height="42"/><path d="M30 320H650"/></g>
                <g fill="#fff" font-family="JetBrains Mono,monospace" font-size="9"><text x="44" y="59">AUTHORIZED VALUE</text><text x="560" y="59">100%</text><text x="44" y="117">DESTINATION RECEIPT</text><text x="452" y="117">observed</text><text x="44" y="175">DECLARED COST</text><text x="362" y="175">interface</text><text x="44" y="233">PROGRAM EFFECT</text><text x="255" y="233">CPI path</text><text x="44" y="291">UNRESOLVED REMAINDER</text><text x="145" y="291">flag</text></g>
                <g fill="#9b9a95"><rect x="530" y="92" width="120" height="42"/><rect x="440" y="150" width="210" height="42"/><rect x="330" y="208" width="320" height="42"/><rect x="218" y="266" width="432" height="42"/></g>
              </svg>
            </div>
            <figcaption>figure 5. attribution is a reconciliation problem: every observed delta is assigned to a disclosed or program-derived cause, otherwise it remains explicit.</figcaption>
          </figure>
        </section>
        <section>
          <h2>on token mechanics</h2>
          <div class="body">
            <p>mint state changes the meaning of a transfer. the classic SPL Token program provides the baseline ownership and authority model; Token-2022 extends that surface with transfer fees, transfer hooks and additional account or mint extensions. Joltwork reads the mint owner first, then exposes parsed authorities, supply precision and available extensions before interpreting settlement.</p>
          </div>
          <div class="signal-stack">
            <div class="signal-row"><span>MINT OWNER</span><span>distinguishes classic SPL Token from Token-2022 execution</span><span>IDENTITY</span></div>
            <div class="signal-row"><span>DECIMALS</span><span>converts integer ledger amounts without floating-point accounting</span><span>QUANTITY</span></div>
            <div class="signal-row"><span>AUTHORITY</span><span>shows mint and freeze control visible in parsed state</span><span>CONTROL</span></div>
            <div class="signal-row"><span>SUPPLY</span><span>preserves raw amount and a human-readable decimal representation</span><span>STATE</span></div>
            <div class="signal-row"><span>EXTENSIONS</span><span>surfaces parsed Token-2022 configuration when returned by RPC</span><span>BEHAVIOR</span></div>
            <div class="signal-row"><span>BALANCE DELTA</span><span>compares confirmed pre- and post-token balances as integers</span><span>SETTLEMENT</span></div>
          </div>
        </section>
        <section>
          <h2>on integration paths</h2>
          <div class="body">
            <p>the same receipt model serves different product surfaces. the interface changes, but the evidence contract remains constant: signature, slot, execution metadata, value movement and participating programs.</p>
          </div>
          <div class="case-grid">
            <div class="case-card"><b>WALLET / CONFIRMATION</b><h3>explain after execution</h3><p>place the settled amount and program path beside the wallet activity record so a user can verify what actually landed.</p></div>
            <div class="case-card"><b>DEX / TRADE HISTORY</b><h3>itemize route outcome</h3><p>attach an evidence-backed receipt to a completed swap instead of presenting only the quoted and received totals.</p></div>
            <div class="case-card"><b>EXPLORER / ANALYSIS</b><h3>compress raw metadata</h3><p>turn instruction trees and balance arrays into an accounting-oriented view without hiding the original signature.</p></div>
            <div class="case-card"><b>TREASURY / OPERATIONS</b><h3>export a stable record</h3><p>download normalized JSON for reconciliation, review, support cases and transaction-level audit trails.</p></div>
            <div class="case-card"><b>RISK / MONITORING</b><h3>track unknown deltas</h3><p>separate recognized program effects from unexplained movement and prioritize transactions requiring decoder coverage.</p></div>
            <div class="case-card"><b>RESEARCH / DATA</b><h3>compare markets</h3><p>aggregate consistent receipts by mint, program, route or slot to study how disclosure and execution diverge over time.</p></div>
          </div>
        </section>
        <section>
          <h2>on confidence semantics</h2>
          <div class="body">
            <p>Joltwork avoids collapsing complex evidence into a single opaque safety score. confidence belongs to individual claims. a network fee is directly reported by transaction metadata; a token delta is calculated from ledger state; a program label depends on program identity; an economic explanation may require a version-specific decoder.</p>
            <p>the product therefore distinguishes observed facts, deterministic derivations, attributed interpretations and unresolved remainder. this lets an integrator show strong facts immediately while keeping uncertainty visible.</p>
          </div>
          <table class="surface-table">
            <thead><tr><th>class</th><th>meaning</th><th>example</th><th>handling</th></tr></thead>
            <tbody>
              <tr><td>OBSERVED</td><td>returned directly by confirmed RPC evidence</td><td>slot, fee, account owner</td><td>DISPLAY</td></tr>
              <tr><td>DERIVED</td><td>deterministically calculated from observed values</td><td>integer token delta</td><td>REPRODUCE</td></tr>
              <tr><td>ATTRIBUTED</td><td>mapped through a known program or token rule</td><td>recognized route effect</td><td>EXPLAIN</td></tr>
              <tr><td>UNRESOLVED</td><td>movement without sufficient supported attribution</td><td>unknown CPI remainder</td><td>FLAG</td></tr>
            </tbody>
          </table>
        </section>
      </div>`;
    document.querySelector(".overlay").before(main);
  }

  mountProductDepth();

  var sourceFiles = {
    readme: [
      "# Joltwork",
      "",
      "Settlement intelligence for Solana.",
      "",
      "- confirmed transaction reconstruction",
      "- exact token balance deltas",
      "- program attribution",
      "- mint and address inspection",
      "- portable JSON receipts"
    ].join(NL),
    sdk: [
      "export async function analyzeTransaction(signature) {",
      "  const transaction = await rpc(\"getTransaction\", [signature]);",
      "  return reconstructSettlement(transaction);",
      "}"
    ].join(NL),
    indexer: [
      "export function reconcile(pre, post) {",
      "  return post.map((balance, index) => ({",
      "    account: index,",
      "    delta: balance - pre[index]",
      "  }));",
      "}"
    ].join(NL),
    program: [
      "pub fn register_program(ctx: Context<Register>, fingerprint: [u8; 32]) -> Result<()> {",
      "  ctx.accounts.record.fingerprint = fingerprint;",
      "  ctx.accounts.record.observed_slot = Clock::get()?.slot;",
      "  Ok(())",
      "}"
    ].join(NL),
    schema: [
      "Receipt {",
      "  signature: string,",
      "  slot: u64,",
      "  settlement: TokenDelta[],",
      "  programs: PublicKey[],",
      "  status: confirmed | failed",
      "}"
    ].join(NL)
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setSource(key, button) {
    byId("repo-view").textContent = sourceFiles[key];
    byId("repo-path").textContent = button.textContent;
    document.querySelectorAll("[data-file]").forEach(function (item) {
      item.classList.toggle("active", item === button);
    });
  }

  function openOverlay(id) {
    var overlay = byId(id);
    if (!overlay) return;
    overlay.classList.add("open");
    byId("backdrop").classList.add("open");
    document.body.classList.add("locked");
  }

  function closeOverlays() {
    document.querySelectorAll(".overlay.open").forEach(function (item) {
      item.classList.remove("open");
    });
    byId("backdrop").classList.remove("open");
    document.body.classList.remove("locked");
  }

  async function rpc(method, params) {
    var lastError;
    for (var attempt = 0; attempt < 3; attempt += 1) {
      for (var index = 0; index < RPC_URLS.length; index += 1) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 20000);
        try {
          var response = await fetch(RPC_URLS[index], {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Date.now(),
              method: method,
              params: params
            }),
            signal: controller.signal
          });
          if (!response.ok) throw new Error("RPC HTTP " + response.status);
          var payload = await response.json();
          if (payload.error) throw new Error(payload.error.message || "RPC request failed");
          return payload.result;
        } catch (error) {
          lastError = error.name === "AbortError" ? new Error("RPC request timed out") : error;
        } finally {
          clearTimeout(timer);
        }
      }
      if (attempt < 2) {
        await new Promise(function (resolve) {
          setTimeout(resolve, 450 * (attempt + 1));
        });
      }
    }
    throw lastError || new Error("all RPC providers unavailable");
  }

  function tokenKey(item) {
    return [item.accountIndex, item.mint, item.owner || ""].join(":");
  }

  function formatRawDelta(raw, decimals) {
    var negative = raw < 0n;
    var value = negative ? -raw : raw;
    var digits = value.toString().padStart(decimals + 1, "0");
    var whole = decimals ? digits.slice(0, -decimals) : digits;
    var fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
    return (negative ? "-" : "+") + whole + (fraction ? "." + fraction : "");
  }

  function formatTokenAmount(raw, decimals) {
    var digits = String(raw || "0").padStart(decimals + 1, "0");
    var whole = decimals ? digits.slice(0, -decimals) : digits;
    var fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
    return whole + (fraction ? "." + fraction : "");
  }

  function reconstructDeltas(meta) {
    var balances = new Map();
    (meta.preTokenBalances || []).forEach(function (item) {
      balances.set(tokenKey(item), {
        accountIndex: item.accountIndex,
        mint: item.mint,
        owner: item.owner || "unresolved",
        decimals: item.uiTokenAmount.decimals,
        pre: BigInt(item.uiTokenAmount.amount),
        post: 0n
      });
    });
    (meta.postTokenBalances || []).forEach(function (item) {
      var key = tokenKey(item);
      var row = balances.get(key) || {
        accountIndex: item.accountIndex,
        mint: item.mint,
        owner: item.owner || "unresolved",
        decimals: item.uiTokenAmount.decimals,
        pre: 0n,
        post: 0n
      };
      row.post = BigInt(item.uiTokenAmount.amount);
      balances.set(key, row);
    });
    return Array.from(balances.values()).map(function (row) {
      return {
        accountIndex: row.accountIndex,
        owner: row.owner,
        mint: row.mint,
        delta: formatRawDelta(row.post - row.pre, row.decimals),
        decimals: row.decimals
      };
    }).filter(function (row) {
      return !/^[-+]0(?:\.0+)?$/.test(row.delta);
    });
  }

  function collectPrograms(transaction) {
    var programs = new Set();
    var message = transaction.transaction.message;
    (message.instructions || []).forEach(function (instruction) {
      if (instruction.programId) programs.add(String(instruction.programId));
      if (instruction.program) programs.add(String(instruction.program));
    });
    ((transaction.meta && transaction.meta.innerInstructions) || []).forEach(function (group) {
      (group.instructions || []).forEach(function (instruction) {
        if (instruction.programId) programs.add(String(instruction.programId));
        if (instruction.program) programs.add(String(instruction.program));
      });
    });
    return Array.from(programs);
  }

  function buildReceipt(signature, transaction) {
    var meta = transaction.meta || {};
    return {
      product: "Joltwork Settlement Receipt",
      network: "solana-mainnet-beta",
      signature: signature,
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      status: meta.err ? "failed" : "confirmed",
      feeLamports: meta.fee || 0,
      computeUnitsConsumed: meta.computeUnitsConsumed || null,
      tokenBalanceDeltas: reconstructDeltas(meta),
      invokedPrograms: collectPrograms(transaction),
      generatedAt: new Date().toISOString()
    };
  }

  function renderReceipt(receipt) {
    latestReceipt = receipt;
    byId("out-slot").textContent = String(receipt.slot);
    byId("out-status").textContent = receipt.status;
    byId("out-fee").textContent = (receipt.feeLamports / 1000000000).toFixed(9) + " SOL";
    byId("out-compute").textContent = receipt.computeUnitsConsumed == null ? "not reported" : Number(receipt.computeUnitsConsumed).toLocaleString();

    var body = byId("delta-body");
    body.innerHTML = "";
    if (!receipt.tokenBalanceDeltas.length) {
      var emptyRow = document.createElement("tr");
      emptyRow.innerHTML = "<td colspan=\"3\">no non-zero token deltas reported</td>";
      body.appendChild(emptyRow);
    } else {
      receipt.tokenBalanceDeltas.forEach(function (delta) {
        var row = document.createElement("tr");
        [delta.owner, delta.mint, delta.delta].forEach(function (value) {
          var cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
    }

    var programList = byId("program-list");
    programList.innerHTML = "";
    receipt.invokedPrograms.forEach(function (program) {
      var code = document.createElement("code");
      code.textContent = program;
      programList.appendChild(code);
    });
    byId("receipt-json").textContent = JSON.stringify(receipt, null, 2);
    byId("receipt").classList.add("open");
    saveHistory(receipt.signature);
  }

  async function analyze(signature) {
    var status = byId("analyzer-status");
    status.textContent = "reading confirmed mainnet evidence...";
    byId("receipt").classList.remove("open");
    var transaction = await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 1 }
    ]);
    if (!transaction) throw new Error("transaction not found or not yet confirmed");
    var receipt = buildReceipt(signature, transaction);
    renderReceipt(receipt);
    status.textContent = "complete - reconstructed from Solana mainnet RPC";
    return receipt;
  }

  async function loadRecentSample() {
    var status = byId("analyzer-status");
    status.textContent = "finding a recent mainnet transaction...";
    var rows = await rpc("getSignaturesForAddress", [
      "11111111111111111111111111111111",
      { limit: 10, commitment: "confirmed" }
    ]);
    var row = rows.find(function (item) { return !item.err; });
    if (!row) throw new Error("no recent sample available");
    byId("sig-input").value = row.signature;
    return analyze(row.signature);
  }

  async function scanAddress(address) {
    var output = byId("address-output");
    output.classList.add("open");
    output.textContent = "loading recent activity...";
    var rows = await rpc("getSignaturesForAddress", [address, { limit: 20, commitment: "confirmed" }]);
    var successful = rows.filter(function (item) { return !item.err; }).length;
    var failed = rows.length - successful;
    var first = rows.length ? rows[rows.length - 1].slot : "n/a";
    var last = rows.length ? rows[0].slot : "n/a";
    output.textContent = [
      "transactions  " + rows.length,
      "successful    " + successful,
      "failed        " + failed,
      "slot range    " + first + " -> " + last,
      "",
      "latest signatures"
    ].concat(rows.slice(0, 5).map(function (item) {
      return (item.err ? "failed  " : "ok      ") + item.signature;
    })).join(NL);
  }

  async function inspectMint(mint) {
    var output = byId("mint-output");
    output.classList.add("open");
    output.textContent = "loading mint state...";
    var account = await rpc("getAccountInfo", [
      mint,
      { encoding: "jsonParsed", commitment: "confirmed" }
    ]);
    if (!account || !account.value) throw new Error("mint account not found");
    var value = account.value;
    var data = value.data;
    var info = data && data.parsed ? data.parsed.info : {};
    var decimals = Number(info.decimals || 0);
    output.textContent = JSON.stringify({
      mint: mint,
      ownerProgram: value.owner,
      lamports: value.lamports,
      executable: value.executable,
      decimals: decimals,
      rawSupply: info.supply || null,
      uiSupply: formatTokenAmount(info.supply, decimals),
      mintAuthority: info.mintAuthority || null,
      freezeAuthority: info.freezeAuthority || null,
      extensions: info.extensions || []
    }, null, 2);
  }

  function saveHistory(signature) {
    try {
      var history = JSON.parse(localStorage.getItem("joltwork.history") || "[]");
      history = [signature].concat(history.filter(function (item) {
        return item !== signature;
      })).slice(0, 8);
      localStorage.setItem("joltwork.history", JSON.stringify(history));
      renderHistory();
    } catch (error) {
      return;
    }
  }

  function renderHistory() {
    var box = byId("history-list");
    var history = [];
    box.innerHTML = "";
    try {
      history = JSON.parse(localStorage.getItem("joltwork.history") || "[]");
    } catch (error) {
      history = [];
    }
    if (!history.length) {
      box.textContent = "no local history yet";
      return;
    }
    history.forEach(function (signature) {
      var button = document.createElement("button");
      button.textContent = signature.slice(0, 8) + "..." + signature.slice(-6);
      button.title = signature;
      button.addEventListener("click", function () {
        byId("sig-input").value = signature;
        runAnalysis(signature);
      });
      box.appendChild(button);
    });
  }

  async function runAnalysis(signature) {
    if (!signature) {
      byId("analyzer-status").textContent = "enter a transaction signature";
      return;
    }
    try {
      await analyze(signature);
    } catch (error) {
      byId("analyzer-status").textContent = "error - " + error.message;
    }
  }

  document.querySelectorAll("[data-file]").forEach(function (button) {
    button.addEventListener("click", function () {
      setSource(button.dataset.file, button);
    });
  });
  setSource("readme", document.querySelector('[data-file="readme"]'));
  var repositoryLink = document.createElement("a");
  repositoryLink.className = "repo-external";
  repositoryLink.href = "https://github.com/dellmodrun/Joltwork";
  repositoryLink.target = "_blank";
  repositoryLink.rel = "noreferrer";
  repositoryLink.textContent = "open complete repository on GitHub";
  byId("overlay-source").querySelector("section").appendChild(repositoryLink);

  document.querySelectorAll("[data-overlay]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      openOverlay(link.dataset.overlay);
    });
  });
  document.querySelectorAll(".overlay-close").forEach(function (button) {
    button.addEventListener("click", closeOverlays);
  });
  byId("backdrop").addEventListener("click", closeOverlays);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeOverlays();
  });

  byId("analyze-btn").addEventListener("click", function () {
    runAnalysis(byId("sig-input").value.trim());
  });
  byId("sig-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") runAnalysis(event.currentTarget.value.trim());
  });
  byId("sample-btn").addEventListener("click", function () {
    loadRecentSample().catch(function (error) {
      byId("analyzer-status").textContent = "error - " + error.message;
    });
  });
  byId("address-btn").addEventListener("click", function () {
    var value = byId("address-input").value.trim();
    if (!value) return;
    scanAddress(value).catch(function (error) {
      byId("address-output").classList.add("open");
      byId("address-output").textContent = "error - " + error.message;
    });
  });
  byId("mint-btn").addEventListener("click", function () {
    var value = byId("mint-input").value.trim();
    if (!value) return;
    inspectMint(value).catch(function (error) {
      byId("mint-output").classList.add("open");
      byId("mint-output").textContent = "error - " + error.message;
    });
  });
  byId("copy-receipt").addEventListener("click", function () {
    if (!latestReceipt) return;
    navigator.clipboard.writeText(JSON.stringify(latestReceipt, null, 2)).then(function () {
      byId("analyzer-status").textContent = "receipt copied to clipboard";
    }).catch(function () {
      byId("analyzer-status").textContent = "copy unavailable - use the JSON panel";
    });
  });
  byId("download-receipt").addEventListener("click", function () {
    if (!latestReceipt) return;
    var blob = new Blob([JSON.stringify(latestReceipt, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "joltwork-" + latestReceipt.signature.slice(0, 12) + ".json";
    link.click();
    URL.revokeObjectURL(url);
  });

  renderHistory();
}());

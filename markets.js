(function () {
  "use strict";

  var STORAGE_KEY = "joltwork.launches.v1";
  var state = { launches: [], pairs: new Map(), filter: "all", sort: "newest", loading: false };
  var byId = function (id) { return document.getElementById(id); };
  if (!byId("market-grid")) return;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function safeUrl(value) {
    try { var url = new URL(value, document.baseURI); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  }

  function validMint(value) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "")); }
  function short(value) { return value ? value.slice(0, 5) + "…" + value.slice(-5) : "—"; }
  function number(value) { var result = Number(value); return Number.isFinite(result) ? result : 0; }
  function timestamp(value) {
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    var parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function money(value, compact) {
    var amount = number(value);
    if (!amount) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: amount < 1 ? 6 : 2 }).format(amount);
  }
  function signed(value) {
    var amount = number(value);
    if (!Number.isFinite(amount)) return "—";
    return (amount > 0 ? "+" : "") + amount.toFixed(2) + "%";
  }
  function time(value) {
    if (!value) return "pending";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "pending" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  }

  function loadLocal() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(function (item) { return validMint(item && item.mint); }).map(function (item) {
        return Object.assign({}, item, { source: "device", verified: true });
      }) : [];
    } catch (_) { return []; }
  }

  async function loadRegistry() {
    try {
      var response = await fetch(new URL("markets/registry.json", document.baseURI), { cache: "no-store" });
      if (!response.ok) throw new Error("registry unavailable");
      var data = await response.json();
      return Array.isArray(data.launches) ? data.launches.filter(function (item) { return validMint(item && item.mint); }).map(function (item) {
        return Object.assign({}, item, { source: "registry", verified: true });
      }) : [];
    } catch (_) { return []; }
  }

  function mergeLaunches(items) {
    var map = new Map();
    items.forEach(function (item) {
      if (!item || !validMint(item.mint)) return;
      var previous = map.get(item.mint) || {};
      map.set(item.mint, Object.assign({}, previous, item));
    });
    return Array.from(map.values());
  }

  async function fetchPairs(mints) {
    var unique = Array.from(new Set(mints.filter(validMint)));
    for (var index = 0; index < unique.length; index += 30) {
      var batch = unique.slice(index, index + 30);
      try {
        var endpoint = "https://api.dexscreener.com/tokens/v1/solana/" + batch.join(",");
        var response = await fetch(endpoint, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("market data request failed");
        var pairs = await response.json();
        batch.forEach(function (mint) {
          var candidates = (Array.isArray(pairs) ? pairs : []).filter(function (pair) {
            return pair && pair.baseToken && pair.baseToken.address === mint;
          });
          candidates.sort(function (a, b) { return number(b.liquidity && b.liquidity.usd) - number(a.liquidity && a.liquidity.usd); });
          if (candidates[0]) state.pairs.set(mint, candidates[0]);
        });
      } catch (_) { /* Keep launch cards visible when the market-data provider is unavailable. */ }
    }
  }

  function pairToken(pair, mint) {
    if (!pair) return null;
    return pair.baseToken && pair.baseToken.address === mint ? pair.baseToken : null;
  }

  function sortLaunches(items) {
    return items.sort(function (a, b) {
      var pairA = state.pairs.get(a.mint) || {};
      var pairB = state.pairs.get(b.mint) || {};
      if (state.sort === "volume") return number(pairB.volume && pairB.volume.h24) - number(pairA.volume && pairA.volume.h24);
      if (state.sort === "liquidity") return number(pairB.liquidity && pairB.liquidity.usd) - number(pairA.liquidity && pairA.liquidity.usd);
      if (state.sort === "market-cap") return number(pairB.marketCap || pairB.fdv) - number(pairA.marketCap || pairA.fdv);
      return timestamp(b.createdAt || b.pairCreatedAt) - timestamp(a.createdAt || a.pairCreatedAt);
    });
  }

  function render() {
    var grid = byId("market-grid");
    var launches = state.launches.filter(function (item) {
      var live = state.pairs.has(item.mint);
      if (state.filter === "live") return live;
      if (state.filter === "awaiting") return !live;
      if (state.filter === "device") return item.source === "device";
      return true;
    });
    sortLaunches(launches);

    var verifiedLaunches = state.launches.filter(function (item) { return item.source !== "search"; });
    var liveCount = verifiedLaunches.filter(function (item) { return state.pairs.has(item.mint); }).length;
    var volume = verifiedLaunches.reduce(function (sum, item) { var pair = state.pairs.get(item.mint); return sum + number(pair && pair.volume && pair.volume.h24); }, 0);
    var liquidity = verifiedLaunches.reduce(function (sum, item) { var pair = state.pairs.get(item.mint); return sum + number(pair && pair.liquidity && pair.liquidity.usd); }, 0);
    byId("market-total").textContent = String(verifiedLaunches.length);
    byId("market-live").textContent = String(liveCount);
    byId("market-volume").textContent = money(volume, true);
    byId("market-liquidity").textContent = money(liquidity, true);
    byId("market-updated").textContent = "UPDATED " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (!launches.length) {
      grid.innerHTML = '<div class="market-empty"><span>NO MATCHING MARKETS</span><h2>No fabricated listings.</h2><p>Launch a coin through Joltwork on this device, or search a Solana Mint address above. Confirmed launches appear here automatically; live price fields appear after a pool has its first indexed transaction.</p><a class="button button-solid" href="./launch/">launch a coin</a></div>';
      return;
    }

    grid.innerHTML = launches.map(function (item) {
      var pair = state.pairs.get(item.mint);
      var token = pairToken(pair, item.mint) || {};
      var info = pair && pair.info || {};
      var image = safeUrl(item.image || info.imageUrl);
      var name = item.name || token.name || "Unresolved token";
      var symbol = item.symbol || token.symbol || "—";
      var change = pair && pair.priceChange ? number(pair.priceChange.h24) : null;
      var pump = "https://pump.fun/coin/" + encodeURIComponent(item.mint);
      var explorer = "https://explorer.solana.com/address/" + encodeURIComponent(item.mint);
      var marketUrl = pair ? safeUrl(pair.url) : "";
      return '<article class="market-card">' +
        '<div class="market-card-head"><div class="market-token-image">' + (image ? '<img src="' + escapeHtml(image) + '" alt="" loading="lazy">' : '<span>' + escapeHtml(symbol.slice(0, 2)) + '</span>') + '</div>' +
        '<div><div class="market-badges"><b>' + (item.source === "search" ? 'MARKET DISCOVERY' : item.official ? 'OFFICIAL TOKEN' : 'JOLTWORK LAUNCH') + '</b><b class="' + (pair ? 'live' : 'pending') + '">' + (pair ? 'LIVE MARKET' : 'AWAITING INDEX') + '</b></div><h2>' + escapeHtml(name) + '</h2><p>$' + escapeHtml(symbol) + ' · ' + escapeHtml(short(item.mint)) + '</p></div></div>' +
        '<div class="market-price"><span>PRICE USD</span><strong>' + money(pair && pair.priceUsd, false) + '</strong><em class="' + (change != null && change < 0 ? 'negative' : '') + '">' + (change == null ? 'not indexed' : signed(change) + ' / 24H') + '</em></div>' +
        '<div class="market-metrics"><div><span>MARKET CAP</span><b>' + money(pair && (pair.marketCap || pair.fdv), true) + '</b></div><div><span>LIQUIDITY</span><b>' + money(pair && pair.liquidity && pair.liquidity.usd, true) + '</b></div><div><span>VOLUME 24H</span><b>' + money(pair && pair.volume && pair.volume.h24, true) + '</b></div><div><span>LAUNCHED</span><b>' + escapeHtml(time(item.createdAt || (pair && pair.pairCreatedAt))) + '</b></div></div>' +
        '<div class="market-ca"><span>MINT</span><code>' + escapeHtml(item.mint) + '</code><button type="button" data-copy-mint="' + escapeHtml(item.mint) + '">COPY</button></div>' +
        '<div class="market-actions"><a class="button button-solid" href="./intent/?outputMint=' + encodeURIComponent(item.mint) + '">trade with intent</a><a class="button" href="' + escapeHtml(pump) + '" target="_blank" rel="noreferrer">pump market ↗</a>' + (marketUrl ? '<a class="button" href="' + escapeHtml(marketUrl) + '" target="_blank" rel="noreferrer">live chart ↗</a>' : '') + '<a class="button" href="' + escapeHtml(explorer) + '" target="_blank" rel="noreferrer">explorer ↗</a></div>' +
        '<p class="market-source">' + (item.official ? 'Verified official CA published by Joltwork.' : item.source === "registry" ? 'Published Joltwork registry entry.' : item.source === "device" ? 'Confirmed launch receipt stored on this device.' : 'Mint supplied for live market discovery.') + ' Market figures are third-party indexed on-chain observations and may be delayed.</p>' +
        '</article>';
    }).join("");
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    var button = byId("market-refresh");
    button.disabled = true;
    button.textContent = "REFRESHING…";
    var registry = await loadRegistry();
    var searched = state.launches.filter(function (item) { return item.source === "search"; });
    state.launches = mergeLaunches(registry.concat(loadLocal(), searched));
    await fetchPairs(state.launches.map(function (item) { return item.mint; }));
    state.loading = false;
    button.disabled = false;
    button.textContent = "REFRESH DATA";
    render();
  }

  byId("market-refresh").addEventListener("click", refresh);
  byId("market-sort").addEventListener("change", function () { state.sort = this.value; render(); });
  document.querySelectorAll("[data-market-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.filter = button.dataset.marketFilter;
      document.querySelectorAll("[data-market-filter]").forEach(function (item) { item.classList.toggle("active", item === button); });
      render();
    });
  });
  byId("market-search-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var mint = byId("market-search").value.trim();
    var message = byId("market-search-message");
    if (!validMint(mint)) { message.textContent = "Enter a valid Solana Mint address."; return; }
    message.textContent = "Loading on-chain market data…";
    if (!state.launches.some(function (item) { return item.mint === mint; })) state.launches.unshift({ mint: mint, source: "search", createdAt: Date.now() });
    await fetchPairs([mint]);
    message.textContent = state.pairs.has(mint) ? "Live market found." : "Mint added; no indexed liquidity pool was found yet.";
    state.filter = "all";
    document.querySelectorAll("[data-market-filter]").forEach(function (item) { item.classList.toggle("active", item.dataset.marketFilter === "all"); });
    render();
  });
  document.addEventListener("click", async function (event) {
    var button = event.target.closest("[data-copy-mint]");
    if (!button) return;
    try { await navigator.clipboard.writeText(button.dataset.copyMint); button.textContent = "COPIED"; setTimeout(function () { button.textContent = "COPY"; }, 1200); }
    catch (_) { button.textContent = "COPY FAILED"; }
  });

  refresh();
}());

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pages = ["index.html", "launch/index.html", "markets/index.html", "intent/index.html", "protocol/index.html", "code/index.html", "research/index.html"];
for (const page of pages) assert.ok(existsSync(resolve(root, page)), `missing route: ${page}`);
assert.equal(readFileSync(resolve(root, "CNAME"), "utf8").trim(), "joltwork.fun", "unexpected custom domain");

for (const page of pages) {
  const html = readFileSync(resolve(root, page), "utf8");
  const baseAtRoot = /<base\s+href=["']\.\.\/["']/i.test(html);
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/i.test(href)) continue;
    if (baseAtRoot && href === "../") continue;
    const clean = href.split(/[?#]/, 1)[0];
    const target = baseAtRoot ? resolve(root, clean) : resolve(dirname(resolve(root, page)), clean);
    const fileTarget = clean.endsWith("/") ? resolve(target, "index.html") : target;
    assert.ok(existsSync(fileTarget), `broken local link in ${page}: ${href}`);
  }
}

const code = readFileSync(resolve(root, "code/index.html"), "utf8");
for (const id of ["code-view", "code-filter", "code-copy", "code-download"]) {
  assert.match(code, new RegExp(`id=["']${id}["']`), `code browser missing ${id}`);
}
const app = readFileSync(resolve(root, "app.js"), "utf8");
const marketsClient = readFileSync(resolve(root, "markets.js"), "utf8");
assert.match(app, /3gAqr1U9CzYhZBoqDJeEQFtphjVGvr24h4znUK2knfVG|codePaths/);
const publicFrontend = [...pages.map((page) => readFileSync(resolve(root, page), "utf8")), app, marketsClient].join("\n");
for (const forbidden of ["github.com", "raw.githubusercontent.com", "dellmodrun", "github.io"]) {
  assert.ok(!publicFrontend.toLowerCase().includes(forbidden), `public frontend exposes forbidden host or account: ${forbidden}`);
}
const intent = readFileSync(resolve(root, "intent/index.html"), "utf8");
for (const id of ["intent-input-mint", "intent-output-mint", "intent-slippage", "intent-quote", "intent-submit"]) {
  assert.match(intent, new RegExp(`id=["']${id}["']`), `intent workbench missing ${id}`);
}
assert.match(app, /api\.jup\.ag\/swap\/v2\/order/, "intent workbench must use Jupiter Swap API V2");
assert.ok(existsSync(resolve(root, "intent-client.js")), "protected swap browser bundle missing");
const launch = readFileSync(resolve(root, "launch/index.html"), "utf8");
for (const id of ["coin-description", "coin-image", "coin-uri", "metadata-check", "launch-submit"]) {
  assert.match(launch, new RegExp(`id=["']${id}["']`), `launch workbench missing ${id}`);
}
const markets = readFileSync(resolve(root, "markets/index.html"), "utf8");
for (const id of ["market-grid", "market-search", "market-refresh", "market-sort", "market-total"]) {
  assert.match(markets, new RegExp(`id=["']${id}["']`), `markets page missing ${id}`);
}
assert.match(marketsClient, /api\.dexscreener\.com\/tokens\/v1\/solana/, "markets must resolve live Solana market data");
assert.match(app, /joltwork\.launches\.v1/, "confirmed launches must be persisted for market discovery");
const marketRegistry = JSON.parse(readFileSync(resolve(root, "markets/registry.json"), "utf8"));
assert.equal(marketRegistry.format, "JOLTWORK_MARKETS_V1", "unexpected markets registry format");
for (const launch of marketRegistry.launches) {
  assert.match(launch.mint, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "registry contains an invalid Solana Mint");
  assert.match(launch.signature, /^[1-9A-HJ-NP-Za-km-z]{64,88}$/, "registry contains an invalid transaction signature");
}
console.log(`site contract: ${pages.length} routes, live markets, live quote controls, metadata gate, same-origin code browser, no GitHub links, custom domain joltwork.fun`);

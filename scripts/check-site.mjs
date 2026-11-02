import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pages = ["index.html", "launch/index.html", "intent/index.html", "protocol/index.html", "code/index.html", "research/index.html"];
for (const page of pages) assert.ok(existsSync(resolve(root, page)), `missing route: ${page}`);
assert.ok(!existsSync(resolve(root, "CNAME")), "custom-domain CNAME must not be present");

const code = readFileSync(resolve(root, "code/index.html"), "utf8");
for (const id of ["code-view", "code-filter", "code-copy", "code-github"]) {
  assert.match(code, new RegExp(`id=["']${id}["']`), `code browser missing ${id}`);
}
const app = readFileSync(resolve(root, "app.js"), "utf8");
assert.match(app, /3gAqr1U9CzYhZBoqDJeEQFtphjVGvr24h4znUK2knfVG|codePaths/);
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
console.log(`site contract: ${pages.length} routes, live quote controls, metadata gate, code browser, no custom domain`);

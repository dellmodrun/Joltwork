import assert from "node:assert/strict";
import test from "node:test";
import { encodeExecuteIntent, hashIntentManifest } from "../dist/index.js";

test("encodes the v1 wire format deterministically", () => {
  const data = encodeExecuteIntent({
    constraints: { expiresAtSlot: 55n, maxInput: 100n, minOutput: 95n, intentId: new Uint8Array(32).fill(7) },
    routeIndices: [0, 5], hookIndices: [6], routeData: Uint8Array.from([9, 8, 7]), hookPayload: Uint8Array.from([4, 2]),
  });
  assert.equal(data.subarray(0, 4).toString(), "JOLT");
  assert.equal(data[4], 1);
  assert.equal(data.readBigUInt64LE(5), 55n);
  assert.equal(data.length, 81);
});

test("canonical manifest hashes ignore object key order", () => {
  assert.deepEqual(
    hashIntentManifest({ route: "Jupiter", limits: { min: 9, max: 10 } }),
    hashIntentManifest({ limits: { max: 10, min: 9 }, route: "Jupiter" }),
  );
});

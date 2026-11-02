import assert from "node:assert/strict";
import test from "node:test";
import { decodeSettlementReceipt } from "../dist/index.js";

test("decodes a JRC1 settlement receipt", () => {
  const receipt = Buffer.alloc(53);
  receipt.write("JRC1"); receipt[4] = 1; receipt.fill(3, 5, 37);
  receipt.writeBigUInt64LE(12n, 37); receipt.writeBigUInt64LE(11n, 45);
  const decoded = decodeSettlementReceipt(receipt);
  assert.equal(decoded.sourceSpent, 12n);
  assert.equal(decoded.destinationReceived, 11n);
  assert.equal(decoded.intentId.length, 32);
});

test("rejects malformed receipts", () => {
  assert.throws(() => decodeSettlementReceipt(Buffer.alloc(53)), /invalid Jolt settlement receipt/);
});

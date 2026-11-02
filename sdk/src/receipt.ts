import type { SettlementReceipt } from "./types.js";

export function decodeSettlementReceipt(data: Uint8Array): SettlementReceipt {
  const buffer = Buffer.from(data);
  if (buffer.length !== 53 || buffer.subarray(0, 4).toString() !== "JRC1" || buffer[4] !== 1) {
    throw new Error("invalid Jolt settlement receipt");
  }
  return {
    intentId: buffer.subarray(5, 37),
    sourceSpent: buffer.readBigUInt64LE(37),
    destinationReceived: buffer.readBigUInt64LE(45),
  };
}

import type { AccountMeta } from "@solana/kit";
import { getAddressEncoder } from "@solana/kit";
import { createHash } from "node:crypto";
import { JOLT_MAGIC, JOLT_VERSION } from "./constants.js";
import type { EncodedIntentConstraints, IntentConstraints } from "./types.js";

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function u64(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError("u64 value out of range");
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return out;
}

function normalizeIntentId(value: Uint8Array): Buffer {
  if (value.length !== 32) throw new Error("intentId must be exactly 32 bytes");
  return Buffer.from(value);
}

export function computeIntentId(args: {
  constraints: Omit<IntentConstraints, "intentId">;
  accounts: AccountMeta[];
  routeIndices: number[];
  hookIndices?: number[];
  routeData: Uint8Array;
  hookPayload?: Uint8Array;
}): Uint8Array {
  const hookIndices = args.hookIndices ?? [];
  const hookPayload = args.hookPayload ?? new Uint8Array();
  if (args.accounts.length > 0xffff) throw new RangeError("too many instruction accounts");
  const header = Buffer.concat([
    Buffer.from([JOLT_VERSION]), u64(args.constraints.expiresAtSlot),
    u64(args.constraints.maxInput), u64(args.constraints.minOutput),
    u16(args.routeIndices.length), u16(hookIndices.length),
    u32(args.routeData.length), u32(hookPayload.length),
  ]);
  const encoder = getAddressEncoder();
  const bindings = Buffer.alloc(2 + args.accounts.length * 32);
  bindings.writeUInt16LE(args.accounts.length, 0);
  args.accounts.forEach((account, index) => bindings.set(encoder.encode(account.address), 2 + index * 32));
  return createHash("sha256").update("JOLT_INTENT_V1").update(header)
    .update(Buffer.from(args.routeIndices)).update(Buffer.from(hookIndices))
    .update(args.routeData).update(hookPayload).update(bindings).digest();
}

export function canonicalIntentJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("intent manifest numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalIntentJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError("intent manifest cannot contain undefined");
      return JSON.stringify(key) + ":" + canonicalIntentJson(record[key]);
    }).join(",") + "}";
  }
  throw new TypeError("intent manifest contains an unsupported value");
}

export function hashIntentManifest(manifest: unknown): Uint8Array {
  return createHash("sha256").update(canonicalIntentJson(manifest)).digest();
}

export function encodeExecuteIntent(args: {
  constraints: EncodedIntentConstraints;
  routeIndices: number[];
  hookIndices?: number[];
  routeData: Uint8Array;
  hookPayload?: Uint8Array;
}): Buffer {
  const hookIndices = args.hookIndices ?? [];
  const hookPayload = args.hookPayload ?? new Uint8Array();
  const indices = [...args.routeIndices, ...hookIndices];
  if (!args.routeIndices.length) throw new Error("routeAccounts cannot be empty");
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index > 255)) {
    throw new RangeError("account indices must fit in u8");
  }
  return Buffer.concat([
    JOLT_MAGIC, Buffer.from([JOLT_VERSION]), u64(args.constraints.expiresAtSlot),
    u64(args.constraints.maxInput), u64(args.constraints.minOutput),
    normalizeIntentId(args.constraints.intentId), u16(args.routeIndices.length),
    u16(hookIndices.length), u32(args.routeData.length), u32(hookPayload.length),
    Buffer.from(args.routeIndices), Buffer.from(hookIndices),
    Buffer.from(args.routeData), Buffer.from(hookPayload),
  ]);
}

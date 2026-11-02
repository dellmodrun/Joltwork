import {
  AccountMeta,
  AccountRole,
  Address,
  Instruction,
  address,
  getAddressEncoder,
  mergeRoles,
} from "@solana/kit";
import { createHash } from "node:crypto";

const MAGIC = Buffer.from("JOLT");
const VERSION = 1;
const FIXED_ACCOUNTS = 5;

export type IntentConstraints = {
  expiresAtSlot: bigint;
  maxInput: bigint;
  minOutput: bigint;
  intentId?: Uint8Array;
};

type EncodedIntentConstraints = IntentConstraints & { intentId: Uint8Array };

export type BuildIntentHookInstruction = {
  programAddress: Address;
  authority: Address;
  sourceTokenAccount: Address;
  destinationTokenAccount: Address;
  routeProgram: Address;
  routeAccounts: AccountMeta[];
  routeData: Uint8Array;
  constraints: IntentConstraints;
  hookProgram?: Address;
  hookAccounts?: AccountMeta[];
  hookPayload?: Uint8Array;
};

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
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("u64 value out of range");
  }
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
    Buffer.from([VERSION]),
    u64(args.constraints.expiresAtSlot),
    u64(args.constraints.maxInput),
    u64(args.constraints.minOutput),
    u16(args.routeIndices.length),
    u16(hookIndices.length),
    u32(args.routeData.length),
    u32(hookPayload.length),
  ]);
  const addressEncoder = getAddressEncoder();
  const accountBindings = Buffer.alloc(2 + args.accounts.length * 34);
  accountBindings.writeUInt16LE(args.accounts.length, 0);
  args.accounts.forEach((account, index) => {
    const offset = 2 + index * 34;
    accountBindings.set(addressEncoder.encode(account.address), offset);
    accountBindings[offset + 32] = account.role >= AccountRole.READONLY_SIGNER ? 1 : 0;
    accountBindings[offset + 33] = account.role === AccountRole.WRITABLE || account.role === AccountRole.WRITABLE_SIGNER ? 1 : 0;
  });
  return createHash("sha256")
    .update("JOLT_INTENT_V1")
    .update(header)
    .update(Buffer.from(args.routeIndices))
    .update(Buffer.from(hookIndices))
    .update(args.routeData)
    .update(hookPayload)
    .update(accountBindings)
    .digest();
}

function dedupeSharedAccounts(
  routeAccounts: AccountMeta[],
  hookAccounts: AccountMeta[],
): { shared: AccountMeta[]; routeIndices: number[]; hookIndices: number[] } {
  const shared: AccountMeta[] = [];
  const indexByKey = new Map<string, number>();

  function add(meta: AccountMeta): number {
    const key = meta.address;
    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      shared[existing] = {
        address: meta.address,
        role: mergeRoles(shared[existing].role, meta.role),
      };
      return FIXED_ACCOUNTS + existing;
    }
    const index = shared.length;
    shared.push({ ...meta });
    indexByKey.set(key, index);
    return FIXED_ACCOUNTS + index;
  }

  return {
    shared,
    routeIndices: routeAccounts.map(add),
    hookIndices: hookAccounts.map(add),
  };
}

export function canonicalIntentJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("intent manifest numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalIntentJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError("intent manifest cannot contain undefined");
      return JSON.stringify(key) + ":" + canonicalIntentJson(record[key]);
    });
    return "{" + entries.join(",") + "}";
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
  const allIndices = [...args.routeIndices, ...hookIndices];
  if (!args.routeIndices.length) throw new Error("routeAccounts cannot be empty");
  if (allIndices.some((index) => !Number.isInteger(index) || index < 0 || index > 255)) {
    throw new RangeError("account indices must fit in u8");
  }
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    u64(args.constraints.expiresAtSlot),
    u64(args.constraints.maxInput),
    u64(args.constraints.minOutput),
    normalizeIntentId(args.constraints.intentId),
    u16(args.routeIndices.length),
    u16(hookIndices.length),
    u32(args.routeData.length),
    u32(hookPayload.length),
    Buffer.from(args.routeIndices),
    Buffer.from(hookIndices),
    Buffer.from(args.routeData),
    Buffer.from(hookPayload),
  ]);
}

export function buildExecuteIntentInstruction(
  args: BuildIntentHookInstruction,
): Instruction {
  const hookAccounts = args.hookAccounts ?? [];
  const hookProgram = args.hookProgram ?? address("11111111111111111111111111111111");
  if (hookAccounts.length && !args.hookProgram) {
    throw new Error("hookProgram is required when hookAccounts are supplied");
  }
  const { shared, routeIndices, hookIndices } = dedupeSharedAccounts(
    args.routeAccounts,
    hookAccounts,
  );
  const accounts: AccountMeta[] = [
    { address: args.authority, role: AccountRole.READONLY_SIGNER },
    { address: args.sourceTokenAccount, role: AccountRole.WRITABLE },
    { address: args.destinationTokenAccount, role: AccountRole.WRITABLE },
    { address: args.routeProgram, role: AccountRole.READONLY },
    { address: hookProgram, role: AccountRole.READONLY },
    ...shared,
  ];
  const computedIntentId = computeIntentId({
    constraints: args.constraints,
    accounts,
    routeIndices,
    hookIndices,
    routeData: args.routeData,
    hookPayload: args.hookPayload,
  });
  if (args.constraints.intentId && !Buffer.from(args.constraints.intentId).equals(Buffer.from(computedIntentId))) {
    throw new Error("intentId does not match the protected instruction fields");
  }
  return {
    programAddress: args.programAddress,
    accounts,
    data: encodeExecuteIntent({
      constraints: { ...args.constraints, intentId: computedIntentId },
      routeIndices,
      hookIndices,
      routeData: args.routeData,
      hookPayload: args.hookPayload,
    }),
  };
}

export function decodeSettlementReceipt(data: Uint8Array): {
  intentId: Uint8Array;
  sourceSpent: bigint;
  destinationReceived: bigint;
} {
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


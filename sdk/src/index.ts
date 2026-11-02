import {
  AccountMeta,
  AccountRole,
  Address,
  Instruction,
  address,
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
  intentId: Uint8Array;
};

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

export function hashIntentManifest(manifest: unknown): Uint8Array {
  return createHash("sha256").update(JSON.stringify(manifest)).digest();
}

export function encodeExecuteIntent(args: {
  constraints: IntentConstraints;
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
  return {
    programAddress: args.programAddress,
    accounts: [
      { address: args.authority, role: AccountRole.READONLY_SIGNER },
      { address: args.sourceTokenAccount, role: AccountRole.WRITABLE },
      { address: args.destinationTokenAccount, role: AccountRole.WRITABLE },
      { address: args.routeProgram, role: AccountRole.READONLY },
      { address: hookProgram, role: AccountRole.READONLY },
      ...shared,
    ],
    data: encodeExecuteIntent({
      constraints: args.constraints,
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


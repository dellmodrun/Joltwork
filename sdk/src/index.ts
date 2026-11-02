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
export const JUPITER_V6_PROGRAM = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

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

export type JupiterInstructionPayload = {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string;
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
  const accountBindings = Buffer.alloc(2 + args.accounts.length * 32);
  accountBindings.writeUInt16LE(args.accounts.length, 0);
  args.accounts.forEach((account, index) => {
    const offset = 2 + index * 32;
    accountBindings.set(addressEncoder.encode(account.address), offset);
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

function dedupeInstructionAccounts(
  fixedAccounts: AccountMeta[],
  routeAccounts: AccountMeta[],
  hookAccounts: AccountMeta[],
): { accounts: AccountMeta[]; routeIndices: number[]; hookIndices: number[] } {
  const accounts: AccountMeta[] = fixedAccounts.map((meta) => ({ ...meta }));
  const indexByKey = new Map<string, number>();
  accounts.forEach((meta, index) => indexByKey.set(meta.address, index));

  function add(meta: AccountMeta): number {
    const key = meta.address;
    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      accounts[existing] = {
        address: meta.address,
        role: mergeRoles(accounts[existing].role, meta.role),
      };
      return existing;
    }
    const index = accounts.length;
    accounts.push({ ...meta });
    indexByKey.set(key, index);
    return index;
  }

  return {
    accounts,
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
  const fixedAccounts: AccountMeta[] = [
    { address: args.authority, role: AccountRole.READONLY_SIGNER },
    { address: args.sourceTokenAccount, role: AccountRole.WRITABLE },
    { address: args.destinationTokenAccount, role: AccountRole.WRITABLE },
    { address: args.routeProgram, role: AccountRole.READONLY },
    { address: hookProgram, role: AccountRole.READONLY },
  ];
  const { accounts, routeIndices, hookIndices } = dedupeInstructionAccounts(
    fixedAccounts,
    args.routeAccounts,
    hookAccounts,
  );
  if ([...routeIndices, ...hookIndices].some((index) => index === 3 || index === 4)) {
    throw new Error("route and hook program accounts cannot be passed as CPI data accounts");
  }
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

export function buildJupiterIntentInstruction(args: {
  joltProgramAddress: Address;
  authority: Address;
  sourceTokenAccount: Address;
  destinationTokenAccount: Address;
  swapInstruction: JupiterInstructionPayload;
  expiresAtSlot: bigint;
  maxInput: bigint;
  minOutput: bigint;
  hookProgram?: Address;
  hookAccounts?: AccountMeta[];
  hookPayload?: Uint8Array;
}): Instruction {
  const routeProgram = address(args.swapInstruction.programId);
  if (routeProgram !== JUPITER_V6_PROGRAM) {
    throw new Error("Jupiter adapter rejected an unexpected route program");
  }
  if (!args.swapInstruction.accounts.length) {
    throw new Error("Jupiter swap instruction has no accounts");
  }
  const routeAccounts = args.swapInstruction.accounts.map((account): AccountMeta => ({
    address: address(account.pubkey),
    role: account.isSigner
      ? (account.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER)
      : (account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY),
  }));
  const source = routeAccounts.find((account) => account.address === args.sourceTokenAccount);
  const destination = routeAccounts.find((account) => account.address === args.destinationTokenAccount);
  if (!source || source.role === AccountRole.READONLY || source.role === AccountRole.READONLY_SIGNER) {
    throw new Error("Jupiter route does not expose the selected source token account as writable");
  }
  if (!destination || destination.role === AccountRole.READONLY || destination.role === AccountRole.READONLY_SIGNER) {
    throw new Error("Jupiter route does not expose the selected destination token account as writable");
  }
  return buildExecuteIntentInstruction({
    programAddress: args.joltProgramAddress,
    authority: args.authority,
    sourceTokenAccount: args.sourceTokenAccount,
    destinationTokenAccount: args.destinationTokenAccount,
    routeProgram,
    routeAccounts,
    routeData: Buffer.from(args.swapInstruction.data, "base64"),
    constraints: {
      expiresAtSlot: args.expiresAtSlot,
      maxInput: args.maxInput,
      minOutput: args.minOutput,
    },
    hookProgram: args.hookProgram,
    hookAccounts: args.hookAccounts,
    hookPayload: args.hookPayload,
  });
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


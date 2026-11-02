import { AccountRole, mergeRoles } from "@solana/kit";
import type { AccountMeta, Instruction } from "@solana/kit";
import { SYSTEM_PROGRAM } from "./constants.js";
import { computeIntentId, encodeExecuteIntent } from "./codec.js";
import type { BuildIntentHookInstruction } from "./types.js";

export function dedupeInstructionAccounts(
  fixed: AccountMeta[], route: AccountMeta[], hook: AccountMeta[],
): { accounts: AccountMeta[]; routeIndices: number[]; hookIndices: number[] } {
  const accounts = fixed.map((meta) => ({ ...meta }));
  const positions = new Map<string, number>();
  accounts.forEach((meta, index) => positions.set(meta.address, index));
  const add = (meta: AccountMeta): number => {
    const existing = positions.get(meta.address);
    if (existing !== undefined) {
      accounts[existing] = { address: meta.address, role: mergeRoles(accounts[existing].role, meta.role) };
      return existing;
    }
    const index = accounts.length;
    accounts.push({ ...meta });
    positions.set(meta.address, index);
    return index;
  };
  return { accounts, routeIndices: route.map(add), hookIndices: hook.map(add) };
}

export function buildExecuteIntentInstruction(args: BuildIntentHookInstruction): Instruction {
  const hookAccounts = args.hookAccounts ?? [];
  const hookProgram = args.hookProgram ?? SYSTEM_PROGRAM;
  if (hookAccounts.length && !args.hookProgram) throw new Error("hookProgram is required when hookAccounts are supplied");
  const fixed: AccountMeta[] = [
    { address: args.authority, role: AccountRole.READONLY_SIGNER },
    { address: args.sourceTokenAccount, role: AccountRole.WRITABLE },
    { address: args.destinationTokenAccount, role: AccountRole.WRITABLE },
    { address: args.routeProgram, role: AccountRole.READONLY },
    { address: hookProgram, role: AccountRole.READONLY },
  ];
  const { accounts, routeIndices, hookIndices } = dedupeInstructionAccounts(fixed, args.routeAccounts, hookAccounts);
  if ([...routeIndices, ...hookIndices].some((index) => index === 3 || index === 4)) {
    throw new Error("route and hook program accounts cannot be passed as CPI data accounts");
  }
  const intentId = computeIntentId({
    constraints: args.constraints, accounts, routeIndices, hookIndices,
    routeData: args.routeData, hookPayload: args.hookPayload,
  });
  if (args.constraints.intentId && !Buffer.from(args.constraints.intentId).equals(Buffer.from(intentId))) {
    throw new Error("intentId does not match the protected instruction fields");
  }
  return {
    programAddress: args.programAddress,
    accounts,
    data: encodeExecuteIntent({
      constraints: { ...args.constraints, intentId }, routeIndices, hookIndices,
      routeData: args.routeData, hookPayload: args.hookPayload,
    }),
  };
}

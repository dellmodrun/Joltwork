import { AccountRole, address } from "@solana/kit";
import type { AccountMeta, Address, Instruction } from "@solana/kit";
import { JUPITER_V6_PROGRAM } from "../constants.js";
import { buildExecuteIntentInstruction } from "../instruction.js";
import type { JupiterInstructionPayload } from "../types.js";

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
  if (routeProgram !== JUPITER_V6_PROGRAM) throw new Error("Jupiter adapter rejected an unexpected route program");
  if (!args.swapInstruction.accounts.length) throw new Error("Jupiter swap instruction has no accounts");
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
    constraints: { expiresAtSlot: args.expiresAtSlot, maxInput: args.maxInput, minOutput: args.minOutput },
    hookProgram: args.hookProgram,
    hookAccounts: args.hookAccounts,
    hookPayload: args.hookPayload,
  });
}

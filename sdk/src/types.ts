import type { AccountMeta, Address } from "@solana/kit";

export type IntentConstraints = {
  expiresAtSlot: bigint;
  maxInput: bigint;
  minOutput: bigint;
  intentId?: Uint8Array;
};

export type EncodedIntentConstraints = IntentConstraints & { intentId: Uint8Array };

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
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};

export type SettlementReceipt = {
  intentId: Uint8Array;
  sourceSpent: bigint;
  destinationReceived: bigint;
};

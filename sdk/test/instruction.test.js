import assert from "node:assert/strict";
import test from "node:test";
import { AccountRole, address } from "@solana/kit";
import { buildExecuteIntentInstruction } from "../dist/index.js";

const keys = [
  "11111111111111111111111111111111", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "SysvarRent111111111111111111111111111111111", "SysvarC1ock11111111111111111111111111111111",
].map(address);

function base() {
  return {
    programAddress: keys[0], authority: keys[1], sourceTokenAccount: keys[2], destinationTokenAccount: keys[3],
    routeProgram: keys[4], routeAccounts: [{ address: keys[1], role: AccountRole.READONLY_SIGNER }, { address: keys[5], role: AccountRole.WRITABLE }],
    routeData: Uint8Array.from([1, 2, 3]), constraints: { expiresAtSlot: 99n, maxInput: 10n, minOutput: 9n },
    hookProgram: keys[6], hookAccounts: [{ address: keys[5], role: AccountRole.READONLY }, { address: keys[7], role: AccountRole.READONLY }],
    hookPayload: Uint8Array.from([42]),
  };
}

test("builds fixed and deduplicated accounts", () => {
  const instruction = buildExecuteIntentInstruction(base());
  assert.equal(instruction.accounts.length, 7);
  assert.equal(instruction.accounts.find((meta) => meta.address === keys[5])?.role, AccountRole.WRITABLE);
  assert.equal(instruction.data.subarray(0, 4).toString(), "JOLT");
});

test("rejects an intent id that does not bind protected fields", () => {
  const args = base();
  args.constraints.intentId = new Uint8Array(32);
  assert.throws(() => buildExecuteIntentInstruction(args), /does not match/);
});

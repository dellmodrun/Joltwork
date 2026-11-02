import assert from "node:assert/strict";
import test from "node:test";
import { address } from "@solana/kit";
import { buildJupiterIntentInstruction } from "../dist/index.js";

const keys = [
  "11111111111111111111111111111111", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
].map(address);

function request() {
  return {
    joltProgramAddress: keys[0], authority: keys[1], sourceTokenAccount: keys[2], destinationTokenAccount: keys[3],
    expiresAtSlot: 500n, maxInput: 100n, minOutput: 95n,
    swapInstruction: {
      programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      accounts: [
        { pubkey: keys[1], isSigner: true, isWritable: false },
        { pubkey: keys[2], isSigner: false, isWritable: true },
        { pubkey: keys[3], isSigner: false, isWritable: true },
      ],
      data: Buffer.from([7, 8, 9]).toString("base64"),
    },
  };
}

test("wraps the official Jupiter v6 program", () => {
  assert.equal(buildJupiterIntentInstruction(request()).data.subarray(0, 4).toString(), "JOLT");
});

test("rejects an unexpected route program", () => {
  const args = request();
  args.swapInstruction.programId = keys[0];
  assert.throws(() => buildJupiterIntentInstruction(args), /unexpected route program/);
});

test("requires writable settlement accounts", () => {
  const args = request();
  args.swapInstruction.accounts[2].isWritable = false;
  assert.throws(() => buildJupiterIntentInstruction(args), /destination token account as writable/);
});

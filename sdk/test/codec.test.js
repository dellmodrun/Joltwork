import assert from "node:assert/strict";
import test from "node:test";
import { AccountRole, address } from "@solana/kit";
import {
  buildExecuteIntentInstruction,
  buildJupiterIntentInstruction,
  decodeSettlementReceipt,
  encodeExecuteIntent,
  hashIntentManifest,
} from "../dist/index.js";

test("encodes the v1 wire format deterministically", () => {
  const data = encodeExecuteIntent({
    constraints: {
      expiresAtSlot: 55n,
      maxInput: 100n,
      minOutput: 95n,
      intentId: new Uint8Array(32).fill(7),
    },
    routeIndices: [0, 5],
    hookIndices: [6],
    routeData: Uint8Array.from([9, 8, 7]),
    hookPayload: Uint8Array.from([4, 2]),
  });
  assert.equal(data.subarray(0, 4).toString(), "JOLT");
  assert.equal(data[4], 1);
  assert.equal(data.readBigUInt64LE(5), 55n);
  assert.equal(data.length, 81);
});

test("canonical manifest hashes do not depend on object key order", () => {
  assert.deepEqual(
    hashIntentManifest({ route: "Jupiter", limits: { min: 9, max: 10 } }),
    hashIntentManifest({ limits: { max: 10, min: 9 }, route: "Jupiter" }),
  );
});

test("builds an instruction with fixed and deduplicated accounts", () => {
  const keys = [
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "ComputeBudget111111111111111111111111111111",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "SysvarRent111111111111111111111111111111111",
    "SysvarC1ock11111111111111111111111111111111",
  ].map(address);
  const instruction = buildExecuteIntentInstruction({
    programAddress: keys[0],
    authority: keys[1],
    sourceTokenAccount: keys[2],
    destinationTokenAccount: keys[3],
    routeProgram: keys[4],
    routeAccounts: [
      { address: keys[1], role: AccountRole.READONLY_SIGNER },
      { address: keys[5], role: AccountRole.WRITABLE },
    ],
    routeData: Uint8Array.from([1, 2, 3]),
    constraints: {
      expiresAtSlot: 99n,
      maxInput: 10n,
      minOutput: 9n,
    },
    hookProgram: keys[6],
    hookAccounts: [
      { address: keys[5], role: AccountRole.READONLY },
      { address: keys[7], role: AccountRole.READONLY },
    ],
    hookPayload: Uint8Array.from([42]),
  });
  assert.equal(instruction.accounts.length, 7);
  const sharedWritable = instruction.accounts.find(
    (meta) => meta.address === keys[5],
  );
  assert.equal(sharedWritable?.role, AccountRole.WRITABLE);
  assert.equal(instruction.data.subarray(0, 4).toString(), "JOLT");
  assert.equal(instruction.data.subarray(29, 61).length, 32);
});

test("rejects a caller-supplied intent id that does not bind the instruction", () => {
  const keys = [
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "ComputeBudget111111111111111111111111111111",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  ].map(address);
  assert.throws(() => buildExecuteIntentInstruction({
    programAddress: keys[0],
    authority: keys[1],
    sourceTokenAccount: keys[2],
    destinationTokenAccount: keys[3],
    routeProgram: keys[4],
    routeAccounts: [{ address: keys[5], role: AccountRole.WRITABLE }],
    routeData: Uint8Array.from([1]),
    constraints: {
      expiresAtSlot: 99n,
      maxInput: 10n,
      minOutput: 9n,
      intentId: new Uint8Array(32),
    },
  }), /does not match/);
});

test("wraps only the official Jupiter route and verifies settlement accounts", () => {
  const keys = [
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  ].map(address);
  const base = {
    joltProgramAddress: keys[0],
    authority: keys[1],
    sourceTokenAccount: keys[2],
    destinationTokenAccount: keys[3],
    expiresAtSlot: 500n,
    maxInput: 100n,
    minOutput: 95n,
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
  const instruction = buildJupiterIntentInstruction(base);
  assert.equal(instruction.data.subarray(0, 4).toString(), "JOLT");
  assert.throws(() => buildJupiterIntentInstruction({
    ...base,
    swapInstruction: { ...base.swapInstruction, programId: keys[0] },
  }), /unexpected route program/);
});

test("decodes a settlement receipt", () => {
  const receipt = Buffer.alloc(53);
  receipt.write("JRC1");
  receipt[4] = 1;
  receipt.fill(3, 5, 37);
  receipt.writeBigUInt64LE(12n, 37);
  receipt.writeBigUInt64LE(11n, 45);
  const decoded = decodeSettlementReceipt(receipt);
  assert.equal(decoded.sourceSpent, 12n);
  assert.equal(decoded.destinationReceived, 11n);
  assert.equal(decoded.intentId.length, 32);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "deployments/devnet.json"), "utf8"));
const endpoint = process.env.JOLTWORK_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(endpoint, "confirmed");
const programKey = new PublicKey(manifest.programId);
const programDataKey = new PublicKey(manifest.programData);
const loaderKey = new PublicKey(manifest.loader);

const [program, programData] = await connection.getMultipleAccountsInfo([programKey, programDataKey], "confirmed");
assert.ok(program, "program account not found");
assert.ok(programData, "ProgramData account not found");
assert.equal(program.executable, true, "program is not executable");
assert.ok(program.owner.equals(loaderKey), "unexpected program loader");
assert.ok(programData.owner.equals(loaderKey), "unexpected ProgramData loader");

// UpgradeableLoaderState::ProgramData has a 45-byte metadata prefix.
const deployedBytes = programData.data.subarray(45);
const digest = createHash("sha256").update(deployedBytes).digest("hex");
assert.equal(digest, manifest.sha256, "deployed SBF digest differs from manifest");

console.log(JSON.stringify({
  cluster: manifest.cluster,
  programId: programKey.toBase58(),
  programData: programDataKey.toBase58(),
  executable: program.executable,
  sha256: digest,
  verified: true,
}, null, 2));

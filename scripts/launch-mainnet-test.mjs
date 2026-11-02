import { readFileSync } from "node:fs";
import { PUMP_PROGRAM_ID, PUMP_SDK } from "@pump-fun/pump-sdk";
import { Connection, Keypair, Transaction } from "@solana/web3.js";

const shouldSend = process.argv.includes("--send");
const keypairPath = process.env.JOLTWORK_KEYPAIR_PATH;
if (!keypairPath) throw new Error("Set JOLTWORK_KEYPAIR_PATH to the protected deployer keypair file.");

const secret = Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")));
const payer = Keypair.fromSecretKey(secret);
const mint = Keypair.generate();
const rpc = process.env.SOLANA_RPC_URL || "https://solana-rpc.publicnode.com";
const metadataUri = "https://dellmodrun.github.io/Joltwork/markets/test-token/metadata.json";
const connection = new Connection(rpc, "confirmed");

const instruction = await PUMP_SDK.createV2Instruction({
  mint: mint.publicKey,
  name: "Joltwork Test",
  symbol: "JOLTTEST",
  uri: metadataUri,
  creator: payer.publicKey,
  user: payer.publicKey,
  mayhemMode: false,
  holderReward: false,
});

if (!instruction.programId.equals(PUMP_PROGRAM_ID)) throw new Error("Unexpected target program.");
if (instruction.keys.length !== 16) throw new Error(`Unexpected create_v2 account count: ${instruction.keys.length}`);

const latest = await connection.getLatestBlockhash("confirmed");
const transaction = new Transaction({
  feePayer: payer.publicKey,
  recentBlockhash: latest.blockhash,
}).add(instruction);
transaction.sign(payer, mint);

const [balance, fee, simulation] = await Promise.all([
  connection.getBalance(payer.publicKey, "confirmed"),
  connection.getFeeForMessage(transaction.compileMessage(), "confirmed"),
  connection.simulateTransaction(transaction),
]);

const report = {
  mode: shouldSend ? "send" : "simulation-only",
  network: "solana-mainnet-beta",
  payer: payer.publicKey.toBase58(),
  payerBalanceSol: balance / 1_000_000_000,
  estimatedTransactionFeeSol: (fee.value || 0) / 1_000_000_000,
  mint: mint.publicKey.toBase58(),
  metadataUri,
  pumpProgram: instruction.programId.toBase58(),
  accountCount: instruction.keys.length,
  simulationError: simulation.value.err,
  simulationUnits: simulation.value.unitsConsumed,
  simulationLogs: shouldSend ? undefined : simulation.value.logs,
};

if (simulation.value.err) {
  console.log(JSON.stringify(report, null, 2));
  throw new Error("Mainnet simulation failed; transaction was not sent.");
}

if (!shouldSend) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const signature = await connection.sendRawTransaction(transaction.serialize(), {
  preflightCommitment: "confirmed",
  maxRetries: 4,
});
let confirmation;
try {
  confirmation = await connection.confirmTransaction({
    signature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }, "confirmed");
} catch (error) {
  const recovered = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
  if (!recovered.value || recovered.value.err) throw error;
  confirmation = { value: { err: null } };
}
if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);

console.log(JSON.stringify({
  ...report,
  status: "confirmed",
  signature,
  explorer: `https://explorer.solana.com/tx/${signature}`,
  pump: `https://pump.fun/coin/${mint.publicKey.toBase58()}`,
}, null, 2));

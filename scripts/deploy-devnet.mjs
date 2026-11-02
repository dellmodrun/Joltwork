import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const rpc = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const root = new URL('../', import.meta.url);
const local = new URL('.local-deploy/', root);
const artifact = new URL('artifact/jolt_guard.so', local);
const programKey = new URL('artifact/jolt_guard-keypair.json', local);
const payerFile = new URL('devnet-payer.json', local);

await mkdir(local, { recursive: true });
const elf = await readFile(artifact);
const program = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(programKey, 'utf8'))));

let payer;
try {
  payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(payerFile, 'utf8'))));
} catch {
  payer = Keypair.generate();
  await writeFile(payerFile, JSON.stringify(Array.from(payer.secretKey)), { mode: 0o600 });
}

const connection = new Connection(rpc, 'confirmed');
let balance = await connection.getBalance(payer.publicKey, 'confirmed');
if (balance < LAMPORTS_PER_SOL) {
  const signature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  balance = await connection.getBalance(payer.publicKey, 'confirmed');
}
if (balance < LAMPORTS_PER_SOL) throw new Error('Devnet payer was not funded by the faucet.');

const deployed = await BpfLoader.load(
  connection,
  payer,
  program,
  elf,
  BPF_LOADER_PROGRAM_ID,
);
const info = await connection.getAccountInfo(program.publicKey, 'confirmed');
if (!info?.executable) throw new Error('Program account is not executable after deployment.');

const result = {
  cluster: 'devnet',
  rpc,
  programId: program.publicKey.toBase58(),
  loader: info.owner.toBase58(),
  executable: info.executable,
  deployed,
  elfBytes: elf.length,
  elfSha256: createHash('sha256').update(elf).digest('hex'),
  payer: payer.publicKey.toBase58(),
};
await writeFile(new URL('devnet-deployment.json', local), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

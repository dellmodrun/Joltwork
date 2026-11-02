import { PUMP_PROGRAM_ID, PUMP_SDK } from '@pump-fun/pump-sdk';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

export type PumpLaunchRequest = {
  provider: {
    publicKey?: { toString(): string };
    signAndSendTransaction?: (transaction: Transaction, options?: object) => Promise<string | { signature: string }>;
    signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  };
  authority: string;
  name: string;
  symbol: string;
  uri: string;
  rpcEndpoint: string;
};

export async function createPumpCoin(request: PumpLaunchRequest) {
  if (!request.provider) throw new Error('Connect a supported wallet first.');
  const user = new PublicKey(request.authority);
  const mint = Keypair.generate();
  const instruction = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey,
    name: request.name,
    symbol: request.symbol,
    uri: request.uri,
    creator: user,
    user,
    mayhemMode: false,
    holderReward: false,
  });
  if (!instruction.programId.equals(PUMP_PROGRAM_ID)) {
    throw new Error('Safety check failed: the instruction does not target the official Pump program.');
  }
  if (instruction.keys.length !== 16) {
    throw new Error('Safety check failed: unexpected Pump create_v2 account layout.');
  }

  const rpcUrl = new URL(request.rpcEndpoint);
  if (rpcUrl.protocol !== 'https:') throw new Error('The RPC endpoint must use HTTPS.');
  const connection = new Connection(rpcUrl.href, 'confirmed');
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: user,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  transaction.partialSign(mint);

  let signature: string;
  if (typeof request.provider.signAndSendTransaction === 'function') {
    const result = await request.provider.signAndSendTransaction(transaction, {
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    signature = typeof result === 'string' ? result : result.signature;
  } else if (typeof request.provider.signTransaction === 'function') {
    const signed = await request.provider.signTransaction(transaction);
    signature = await connection.sendRawTransaction(signed.serialize(), {
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
  } else {
    throw new Error('This wallet does not expose a supported transaction signing method.');
  }

  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }, 'confirmed');
  if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);

  return {
    mint: mint.publicKey.toBase58(),
    signature,
    explorer: `https://solscan.io/tx/${signature}`,
    pump: `https://pump.fun/coin/${mint.publicKey.toBase58()}`,
  };
}

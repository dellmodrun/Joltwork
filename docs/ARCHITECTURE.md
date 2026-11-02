# Joltwork architecture

Joltwork places a settlement guard around one user-authorized transaction. Unlike a pool hook, the guard is not owned by one liquidity pool. It binds the signer, ordered accounts, route instruction, optional policy hook, expiry, maximum input and minimum output into one intent identifier.

## Execution boundary

1. An application obtains a route instruction and names the source and destination token accounts.
2. The SDK validates the route program and writable settlement accounts, deduplicates accounts and computes the intent ID.
3. Jolt Guard checks the signer and expiry, snapshots balances, invokes the policy and route programs through CPI, then reloads balances.
4. Settlement succeeds only if actual input and output satisfy the signed bounds. Any failure reverts the entire Solana transaction.
5. A JRC1 return value reports the intent ID, input spent and output received for clients and indexers.

## Trust model

The program trusts the user signature and Solana atomicity. It does not trust route output claims. Adapters are responsible for accepting only known route programs and exposing the correct writable token accounts. Mainnet use additionally requires audited adapters, verified program binaries, RPC monitoring and an incident process.

## Repository layers

- `programs/jolt-guard`: on-chain enforcement and CPI execution.
- `sdk/src/codec.ts`: deterministic wire format and intent commitment.
- `sdk/src/instruction.ts`: ordered account construction and role merging.
- `sdk/src/adapters`: route-specific validation before instruction assembly.
- `sdk/src/receipt.ts`: settlement return-data decoding.
- `deployments`: published network identity and reproducible build evidence.

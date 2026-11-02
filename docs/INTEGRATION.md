# Integration guide

## Install and build

The SDK is currently consumed from this repository while the API is stabilized.

```bash
cd sdk
npm ci
npm test
```

Import `buildJupiterIntentInstruction` from `dist/index.js`. Supply the official Jupiter v6 swap instruction, user authority, source and destination token accounts, expiry slot and settlement limits. The adapter rejects another route program or read-only settlement accounts before the wallet is asked to sign.

## Transaction assembly

Place compute-budget instructions first, followed by the Jolt Guard instruction. Do not also append the original swap instruction: the guard invokes its bytes through CPI. Keep all route accounts in the order returned by the router. A wallet should display the expiry, maximum input, minimum output and hook identity before signing.

## Confirmation

Use a recent blockhash and confirm with the same blockhash context. On success, read JRC1 return data or index the transaction logs. On failure, surface the program error; there is no partial route settlement because Solana rolls the transaction back atomically.

## Deployment identity

Devnet Program ID: `3gAqr1U9CzYhZBoqDJeEQFtphjVGvr24h4znUK2knfVG`.

Mainnet Program ID: `6HfEuWvEmargNraXeqCiqCZRJ223kGjxsCB7H9S3ENTY`.

Applications must select Program IDs by network. Never silently use the devnet identity on mainnet-beta. Verify the account owner, executable flag and published SBF digest before enabling a release.

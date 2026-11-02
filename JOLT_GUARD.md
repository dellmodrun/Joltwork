# Jolt Guard: intent-level hooks for Solana

Jolt Guard is an atomic execution wrapper for Solana routes. A user signs
explicit settlement constraints together with the route instruction. The
program records token balances, invokes the route through CPI, reloads the
accounts, and rejects the entire transaction unless the postconditions hold.

## Why this is different from a block explorer

A block explorer describes a transaction after it has settled. Jolt Guard
changes whether the transaction is allowed to settle.

## Why this is different from Token-2022 Transfer Hooks

Transfer Hooks are configured by a mint authority and run for each transfer of
that mint. Jolt Guard is configured by the user for one complete transaction
intent. It can constrain a route that crosses multiple programs and token
programs.

## Fixed accounts

| index | account | requirement |
|---:|---|---|
| 0 | authority | signer |
| 1 | source token account | writable |
| 2 | destination token account | writable |
| 3 | route program | executable |
| 4 | policy hook program | executable when hook accounts are present |
| 5+ | shared CPI accounts | privileges are preserved, never escalated |

The instruction carries ordered one-byte indices into this account list. This
lets the route and policy hook receive different ordered account views without
duplicating transaction accounts.

## Execution

1. Verify authority, expiry and executable program accounts.
2. Read source and destination token balances.
3. Invoke the policy hook with phase PRE, if configured.
4. Invoke the route program with the exact route data.
5. Reload balances and calculate integer input/output deltas.
6. Reject if input exceeds max_input or output is below min_output.
7. Invoke the policy hook with phase POST, if configured.
8. Return JRC1, version, intent_id, source_spent and destination_received.

Any error from the route, policy hook or postcondition aborts the Solana
transaction atomically.

## Policy hook interface

Hook data begins with JHK1, version and phase, followed by the intent id,
constraints, pre-balances, realized deltas and an opaque user payload. A policy
program accepts the settlement by returning success and rejects it by returning
an error.

Examples include allowed-route policies, maximum Token-2022 transfer-fee
policies, treasury counterparty policies, allow lists, volatility-dependent
minimum output and protocol-specific disclosure rules.

## Current boundary

The v1 program enforces token-account postconditions and a direct route
program. Full inner-CPI economic attribution is produced off-chain by the
Joltwork receipt engine from confirmed transaction metadata.


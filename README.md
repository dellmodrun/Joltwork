# Joltwork

Intent-level hooks and verifiable settlement for Solana.

Joltwork is not a block explorer. Jolt Guard changes whether a route is allowed
to settle. A user signs maximum-input, minimum-output and expiry constraints;
the program executes the route through CPI and atomically rejects settlement if
the realized token-account deltas violate the intent.

## Protocol

- programs/jolt-guard: native Rust Solana program.
- sdk: Solana Kit instruction builder and receipt decoder.
- JOLT_GUARD.md: wire format, accounts and policy-hook interface.

The program supports optional PRE and POST policy hooks. A policy program can
reject a route based on its own payload and accounts. Successful execution
returns a compact JRC1 receipt containing the intent id, realized input and
realized output.

The SDK includes a Jupiter v6 adapter that rejects unexpected route program
ids, verifies that the selected settlement accounts are writable in the swap
instruction, and wraps the exact route bytes in a canonical JOLT intent.

## Web product

- index.html and app.js: public Joltwork interface.
- dist/index.html: single-file build with embedded visual assets.
- bundle.py: regenerates the single-file build.

Run the site locally with:

    python -m http.server 8000

Build and test the SDK with:

    cd sdk
    npm ci
    npm test

Test the on-chain program with:

    cargo test --manifest-path programs/jolt-guard/Cargo.toml

## Deployment

GitHub Pages serves the repository root. The protocol CI compiles the Rust
program and TypeScript SDK independently from the static-site deployment.

Jolt Guard is deployed on Solana devnet at
[`3gAqr1U9CzYhZBoqDJeEQFtphjVGvr24h4znUK2knfVG`](https://explorer.solana.com/address/3gAqr1U9CzYhZBoqDJeEQFtphjVGvr24h4znUK2knfVG?cluster=devnet).
The source commit, loader, program-data account and SBF SHA-256 are recorded in
[`deployments/devnet.json`](deployments/devnet.json). This Kora-sponsored
deployment is an integration target, not a mainnet production claim; Kora may
reclaim devnet programs after seven days without on-chain activity.

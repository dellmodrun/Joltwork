# Contributing

Keep protocol changes reviewable across all layers. A wire-format or account-order change must update the Rust parser, TypeScript codec, specification and tests in the same pull request.

Before opening a pull request, run `cargo test --manifest-path programs/jolt-guard/Cargo.toml`, `npm test` inside `sdk`, and `npm run test:site` at the repository root. Do not commit wallet keys, RPC credentials, generated dependency folders or unverified deployment claims.

Small commits are preferred. Explain the invariant being changed, include negative tests and identify whether the change is backward compatible with JOLT V1.

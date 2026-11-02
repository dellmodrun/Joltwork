# Deployment and operations

## Release gates

1. Run Rust and SDK tests from a clean commit.
2. Build the SBF artifact in the pinned CI environment.
3. Record the source commit and SHA-256 digest in the deployment manifest.
4. Deploy with a protected upgrade authority.
5. Verify loader ownership, executable state, ProgramData address and deployed byte digest.
6. Exercise supported adapters on the target cluster.
7. Publish the manifest before enabling the frontend network.

## Monitoring

Track invocation success rate, error codes, compute-unit consumption, adapter version and settlement deltas. Alerts should distinguish user constraint failures from infrastructure faults. RPC providers must be replaceable without changing signed intent semantics.

## Incident response

If an adapter or program defect is suspected, disable new frontend submissions, preserve transaction evidence and publish the affected program and adapter versions. Upgrade only after reproducing the issue and adding a regression test. A program upgrade does not rewrite already-settled transactions.

# Test fixtures

Deterministic synthetic fixtures for CSV normalization, domain boundaries, integration tests, and financial reconciliation live here.

Rules:

- never copy real client data into a fixture;
- store the expected normalized result beside each input;
- make dates explicit and inject `asOfDate` rather than using the wall clock;
- make expected money totals independently reconcilable;
- include the canonical CSV cases listed in `docs/06-csv-import-contract.md`.

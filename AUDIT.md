# DataTrust Passport audit — October 19, 2026

## Baseline findings

| Area | Status | Evidence | Severity | Action taken |
|---|---|---|---|---|
| Static app startup | Implemented | `index.html` + Python static server | P0 | Kept dependency-free and documented |
| CSV upload | Partial | File picker worked; no drop zone or size guard | P0 | Added drop zone, CSV extension check and 5 MB parser limit |
| CSV correctness | Partial | Quoted fields worked; malformed rows were silently normalized | P0 | Parser now rejects malformed row widths and unterminated quotes |
| Quality audit | Partial | Missingness, duplicates, PII and heuristic outliers existed | P0 | Added IQR outlier explanation, subgroup missingness, small-group and class-imbalance warnings |
| Evidence cards | Partial | Findings had explanation but no current-row preview or review state | P1 | Preserved review state and current-data preview; affected-row drill-down remains deferred |
| Cleaning | Missing | Export only returned the original rows | P0 | Added duplicate removal, whitespace normalization, missing-income exclusion, undo and reset |
| Conclusion stress test | Implemented | Three deterministic scenarios existed | P1 | Preserved and connected it to current approved data state and exports |
| Provenance | Partial | Markdown report existed without source identity | P0 | Added local SHA-256, file bytes, dimensions, operations and JSON audit export |
| Privacy | Implemented | No backend or external data calls | P0 | Kept local-only processing and escaped rendered values |
| Tests | Partial | Four core tests existed | P0 | Expanded to eight tests including malformed CSV, duplicate headers, cleaning and audit JSON |

## Intentionally deferred

- Statistical significance tests and causal inference.
- Full row-level affected-record explorer.
- Date/time-series checks and automatic outcome selection.
- Persistent project storage and hosted deployment.
- Full browser automation and visual regression tooling.

These are not silently represented as implemented features.

# DataTrust Passport

> Turn a messy dataset into a defensible research result.

DataTrust Passport is a local-first research integrity workbench. Upload a CSV and it produces an evidence ledger for missingness, duplicates, invalid values, outliers, identifier collisions and possible personal information. Its standout feature is a **Conclusion Stress Test**: a transparent comparison of one group-level numerical conclusion under original, duplicate-removal and median-imputation assumptions.

## Why it is different

DataTrust is not an opaque “data quality score” or an AI that silently changes a file. Deterministic checks compute the signals locally. The interface turns each signal into an evidence card:

**Finding → Evidence → Why it matters → Suggested action → Researcher review**

The stress test extends that trail from data quality to conclusions:

**Research question → Cleaning assumption → Group means → Direction → Stability warning**

The passport is deliberately honest: it identifies risks but does not certify truth, causality, fairness or legal compliance.

## Run locally

Requires Python 3 or any static web server.

```bash
npm test
npm run serve
```

Open <http://localhost:4173> and choose **Load demo dataset** or upload your own CSV. Files are read in the browser and are not sent to a server.

## Architecture

- `index.html` — dependency-free browser shell.
- `src/analysis.js` — pure CSV parser, deterministic quality checks, cleaning operations, conclusion stress test and report builders.
- `src/app.js` — UI state, upload/drop workflow, evidence review, cleaning approval and downloads.
- `src/styles.css`, `src/stress.css`, `src/audit.css` — responsive visual system and feature-specific presentation.
- `test/analysis.test.js` — Node built-in tests using synthetic fixtures with expected results.

There is no backend, database, analytics SDK or hidden API dependency. The original file stays in browser memory; the SHA-256 fingerprint is computed locally with Web Crypto.

## MVP workflow

1. Upload a CSV or load the synthetic survey dataset.
2. Select the intended use: research, machine learning or survey analysis.
3. Inspect the readiness signal and evidence ledger.
4. Review the conclusion stress test: one numerical group comparison across three assumptions.
5. Mark findings as reviewed and export a Markdown research passport with the comparison.

## Demo walkthrough

1. Click **Load demo dataset**.
2. Open the **Completeness** and **Integrity** evidence cards.
3. In **Cleaning Studio**, approve **Remove exact duplicates** and review the operation log.
4. Open **Conclusion Stress Test** and compare the original, duplicate-removal and median-imputation scenarios.
5. Export the Markdown passport or structured JSON audit record.

The demo is synthetic and deliberately contains duplicate records, missing income values, an invalid age, unusual sleep hours, possible email PII and a conclusion whose descriptive direction can change under the tested assumptions. These planted problems are for demonstration only, not evidence about a real population.

## Prior work and acknowledgements

DataTrust builds on ideas found in established open-source tools rather than claiming scientific originality: [OpenRefine](https://docs.openrefine.org/) for data transformation, [YData Profiling](https://docs.profiling.ydata.ai/latest/) for profiling, [Evidently](https://docs.evidentlyai.com/) for data evaluation and drift, and [Great Expectations](https://greatexpectations.io/) for explicit data expectations. The project’s contribution is a small, researcher-facing workflow that connects quality evidence to a descriptive conclusion-sensitivity comparison and a reproducible export.

## Limitations

The MVP is intentionally local and bounded. It does not claim to prove data quality, infer causality, establish statistical significance, certify privacy compliance, or replace domain review. The outlier, PII and imputation checks are heuristics; important decisions must be verified against the source and research context. The stress test is a sensitivity signal, not a formal statistical test.

## Security and privacy

- CSV contents are not transmitted by this application.
- HTML output escapes dataset values before rendering.
- CSV export quotes delimiters, quotes and line breaks.
- A 5 MB input limit prevents accidental oversized browser workloads.
- PII detection is a column-name heuristic, not a privacy certification.
- Do not load data that you are not permitted to process or share. Review exports before publication.

## Built with OmniRush

This project was designed and implemented in OmniRush. No external generative AI tool was used for the build.

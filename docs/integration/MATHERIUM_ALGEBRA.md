# Matherium Algebra Integration

Provider service `mathir-validator@0.2.0` speaks Matherium Protocol `0.2.0` and exposes three deterministic synchronous capabilities with no authentication:

- `mathir.check-polynomial-equivalence@0.1.0`
- `mathir.normalize-polynomial@0.1.0`
- `mathir.validate-document@0.1.0`

The manifest is generated from one static registry sorted by capability ID/version. There is no plugin discovery or dynamic loading. Each wrapper is a strict Draft 2020-12 object schema, while `document` deliberately accepts any JSON value so invalid MathIR documents reach the Provider and become `invalid_document` domain outcomes. Wrapper failures are HTTP 422, unknown capabilities are HTTP 404, and all algebra domain outcomes are HTTP 200 with `status: succeeded`; only sanitized internal exceptions use `ExecuteFailure`.

Examples in the manifest are produced by the actual execute functions and tested against Zod and Ajv strict mode. Normal forms are limited to 300 KiB in `@mathir/algebra`; validation diagnostics use stable prefix bounding; every final Provider output is limited to 900 KiB serialized UTF-8 without silently truncating polynomial terms.

`pnpm test:matherium-conformance` runs the unmodified external Matherium suite at the SHA pinned in CI. `pnpm test:matherium-e2e` registers the expanded manifest with the real Hub and PostgreSQL, then checks validation regression, normalization, equivalent, not-equivalent, unknown, and invalid-document invocations. Every case verifies succeeded Invocation state, events, output Artifact content/schema, and producer service/capability/version provenance.

The wire contract uses formal polynomial semantics only. `equivalent` is not a claim of general mathematical or real-function equivalence.

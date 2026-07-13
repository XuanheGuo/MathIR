# MathIR Matherium Provider

`apps/provider` is a standalone HTTP service that exposes MathIR document
validation as a [Matherium](https://github.com/XuanheGuo/Matherium)
Capability Provider. It wraps `@mathir/validator` (Phase 1A) behind the
Matherium Protocol 0.2.0 wire format and runs independently of the
Matherium monorepo — it does not depend on, import, or bundle any
`@matherium/*` package. The wire contract it speaks is a small,
hand-written adapter in `apps/provider/src/protocol.ts`, verified against
the real Matherium source and re-checked on every CI run by the external
Matherium Conformance Suite (see [MATHERIUM_E2E.md](./MATHERIUM_E2E.md)).

## Four distinct versions

These are independent and must not be confused:

| Version | Value | Meaning |
| --- | --- | --- |
| Matherium Protocol version | `0.2.0` | The wire format this provider speaks. |
| MathIR document version | `0.1.0` | The MathIR document schema `@mathir/validator` accepts (unchanged from Phase 1A). |
| Capability version | `0.1.0` | The version of `mathir.validate-document` itself. |
| Provider service version | `0.4.0` | The version of this HTTP service. |

Bumping one does not imply bumping the others. This phase does not change
the MathIR document version.

## Service identity

- **Service ID:** `mathir-validator`
- **Service version:** `0.4.0`
- **Capability ID:** `mathir.validate-document` (dot-separated per Matherium's
  capability ID grammar — no underscores)
- **Capability version:** `0.1.0`
- **Execution mode:** `sync`
- **Deterministic:** `true`
- **Authentication:** `none`

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/matherium/service.json` | Service manifest |
| `GET` | `/health` | Liveness: `{ "status": "ok", "serviceId": "mathir-validator", "version": "0.4.0" }` |
| `POST` | `/v0/execute` | Matherium execute envelope |

## Capability input/output contract

Input is a strict wrapper, not the MathIR document schema itself:

```json
{ "document": /* any JSON value */ }
```

`document` is intentionally typed as "any JSON value" in the published
JSON Schema, not as a valid MathIR document. If the input schema itself
required a valid document, the Matherium Hub would reject malformed or
invalid documents before they ever reached the provider, and the provider
could never return `SCHEMA_INVALID`, `UNSUPPORTED_VERSION`, or reference
diagnostics — but validating malformed/invalid documents is the whole
point of this capability. The wrapper is still validated strictly: it
must be a JSON object with exactly one property, `document`, whose value
is itself a JSON value (no `undefined`, functions, `BigInt`, etc. — those
can't occur in production since a JSON HTTP body can't carry them, but
`parseValidateDocumentInput` in `apps/provider/src/capability.ts` checks
for them anyway for direct callers).

Output never echoes the input document back:

```ts
interface ValidateDocumentOutput {
  valid: boolean;
  documentId: string | null; // only if the raw input has a syntactically valid id
  declaredMathirVersion: string | null; // only if it's a reasonable-length string
  diagnostics: Diagnostic[]; // the validator's own stable order, never re-sorted
  totalDiagnostics: number; // the true count, before any truncation
  diagnosticsTruncated: boolean;
}
```

`valid` always reflects the full, untruncated validator result — it is
never recomputed from a truncated diagnostics list.

### Invalid MathIR documents are a successful invocation

This is the central semantic rule of the capability. A structurally
invalid document, an unsupported `mathirVersion`, a dangling expression
reference, a cyclic step dependency, an arity mismatch — all of these are
normal validation *results*, not provider or protocol failures. The HTTP
response is always `200` with `status: "succeeded"` and
`output.valid: false`, never a `4xx`/`5xx` or `status: "failed"`. Only a
malformed execute envelope, an unsupported protocol version, an unknown
capability, an invalid input wrapper, or a genuine internal exception are
treated as exchange-level failures (see `apps/provider/src/server.ts`).

### Output size bounding

Matherium caps provider responses and Artifacts at 1 MiB. To stay well
under that regardless of how many diagnostics a document produces, the
provider targets a 900 KiB serialized-output budget
(`OUTPUT_BYTE_BUDGET` in `apps/provider/src/constants.ts`). If the full
diagnostics list would exceed the budget, the provider keeps the longest
stable prefix of the validator's own diagnostic order that fits (found by
binary search over prefix length, not linear/O(n²) re-serialization),
sets `diagnosticsTruncated: true`, and reports the true `totalDiagnostics`
count regardless of truncation. `valid` is unaffected by truncation.

## Local run

```sh
pnpm install --frozen-lockfile
pnpm build
MATHIR_PROVIDER_HOST=127.0.0.1 MATHIR_PROVIDER_PORT=4110 node apps/provider/dist/main.js
```

```sh
curl http://127.0.0.1:4110/health
curl http://127.0.0.1:4110/.well-known/matherium/service.json
```

Or for local development with autoreload:

```sh
pnpm --filter @mathir/provider dev
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `MATHIR_PROVIDER_HOST` | `127.0.0.1` | Listen host |
| `MATHIR_PROVIDER_PORT` | `4110` | Listen port |
| `MATHIR_PROVIDER_PUBLIC_URL` | derived from the bound address | `baseUrl` advertised in the manifest; must exactly match the URL a Matherium Hub uses to fetch the manifest |
| `LOG_LEVEL` | `info` | Fastify/pino log level |
| `BODY_LIMIT_BYTES` | `1048576` (1 MiB) | Request body size limit |

## Protocol compatibility baseline

Compatibility with Matherium is verified against
`XuanheGuo/Matherium@73b02d660fa1d62140b4c0efacbf5274804b1e8b` (protocol
version `0.2.0`; provider service version `0.4.0`) via the real, external Matherium Conformance Suite and a
real Hub + PostgreSQL + Artifact end-to-end test — see
[MATHERIUM_E2E.md](./MATHERIUM_E2E.md) for how those run in CI and how to
reproduce them locally.

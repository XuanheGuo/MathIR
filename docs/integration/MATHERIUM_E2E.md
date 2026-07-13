# Matherium Conformance and Hub End-to-End Testing

Two CI jobs verify the [MathIR Provider](./MATHERIUM_PROVIDER.md) against
a real, externally checked-out Matherium — not an in-repo copy of its
tests, and not a mock Hub or in-memory database.

## Pinned Matherium

- **Repository:** `XuanheGuo/Matherium`
- **Pinned SHA:** `73b02d660fa1d62140b4c0efacbf5274804b1e8b`
- **Protocol version:** `0.2.0`

The pin lives in `.github/workflows/ci.yml` (`env.MATHERIUM_SHA`) and in
`scripts/matherium-e2e.mjs`'s process orchestration. The checkout goes to
`.external/matherium`, which is gitignored: it is a test/CI fixture only,
never a MathIR runtime dependency, and MathIR must never depend on any
`@matherium/*` package.

## `matherium-conformance` job

1. Checks out MathIR and, separately, Matherium at the pinned SHA into
   `.external/matherium`.
2. Installs and builds both repositories.
3. Starts `apps/provider/dist/main.js` and polls `/health` until ready
   (no fixed sleep).
4. Runs the real conformance CLI from the Matherium checkout:
   ```sh
   pnpm --filter @matherium/conformance run run http://127.0.0.1:4110
   ```
   which checks: manifest validity, health endpoint, capability ID/version
   syntax, the execute protocol round-trip, output-schema validation, the
   error-response shape, and (since the capability is declared
   deterministic) that two concurrent executions of the same example
   produce byte-identical output.
5. Stops the provider whether the run passed or failed.

Reproduce locally:

```sh
pnpm install --frozen-lockfile && pnpm build
git clone https://github.com/XuanheGuo/Matherium.git .external/matherium
git -C .external/matherium checkout 73b02d660fa1d62140b4c0efacbf5274804b1e8b
pnpm --dir .external/matherium install --frozen-lockfile
pnpm --dir .external/matherium build
pnpm test:matherium-conformance
```

## `matherium-hub-e2e` job

1. Same MathIR + Matherium checkout/build as above.
2. Starts a **PostgreSQL 17** GitHub Actions service container (matching
   Matherium's own pinned Postgres version; no extensions required).
3. Runs real Matherium migrations: `pnpm db:migrate` in
   `.external/matherium`.
4. `scripts/matherium-e2e.mjs --mode=hub` then:
   - starts the MathIR provider and polls `/health`;
   - starts the Matherium Hub (`pnpm --filter @matherium/hub-api start`)
     and polls `/health/ready` (which itself checks the database
     connection);
   - registers the provider via `POST /v0/admin/services` with
     `Authorization: Bearer $MATHERIUM_ADMIN_TOKEN`;
   - confirms `/v0/capabilities` lists validation, polynomial normalization/equivalence,
     and rational-function normalization/equivalence at `0.1.0`, offered by `mathir-validator`;
   - invokes validation and polynomial regressions plus rational cancellation normalization,
     conditional equivalence, assumption-discharged equivalence, same-domain equivalence,
     non-equivalence, multivariate unknown, and invalid-document cases via `POST /v0/invocations`;
   - for each Invocation, fetches `/v0/invocations/:id/events` and
     asserts on `invocation.created`, `provider.request_sent`,
     `provider.response_received`, `artifact.created`, and an
     `invocation.status_changed` event with `toStatus: "succeeded"`
     (Matherium 0.2.0 has no separate `invocation.succeeded` event —
     success is represented by a status-change event, confirmed by
     reading the pinned Matherium source rather than assumed);
   - fetches the output Artifact via `/v0/artifacts/:id` and asserts on
     its `kind`, `mediaType`, `schemaVersion`, `producer`, exact
     `content`, and that the content satisfies the provider's own
     published output JSON Schema.
5. Stops the Hub and provider in a `finally` block regardless of outcome.

All HTTP calls and assertions are plain `fetch` + `node:assert`, not shell
`grep` over JSON text.

### Key assertions

**Valid document** — Invocation `status: "succeeded"`,
`capabilityId: "mathir.validate-document"`, `capabilityVersion: "0.1.0"`,
`serviceId: "mathir-validator"`; Artifact `kind: "capability.output"`,
`mediaType: "application/json"`, `schemaVersion: "0.1.0"`, `producer`
matching the same triple; Artifact content exactly
`{ valid: true, documentId: "minimal", declaredMathirVersion: "0.1.0", diagnostics: [], totalDiagnostics: 0, diagnosticsTruncated: false }`.

**Semantically invalid document** — Invocation status is still
`"succeeded"` (this is the guardrail against ever mapping MathIR-level
invalidity onto Hub-level invocation failure); Artifact content has
`valid: false` and includes an `UNKNOWN_EXPRESSION_REFERENCE` diagnostic.

Reproduce locally (requires a local PostgreSQL 17):

```sh
# one-time setup
createuser matherium && createdb -O matherium matherium
psql -d postgres -c "ALTER ROLE matherium WITH LOGIN PASSWORD 'matherium';"

pnpm install --frozen-lockfile && pnpm build
pnpm --dir .external/matherium install --frozen-lockfile
pnpm --dir .external/matherium build
DATABASE_URL=postgres://matherium:matherium@127.0.0.1:5432/matherium \
  pnpm --dir .external/matherium db:migrate

DATABASE_URL=postgres://matherium:matherium@127.0.0.1:5432/matherium \
HUB_HOST=127.0.0.1 HUB_PORT=4000 \
MATHERIUM_ADMIN_TOKEN=test-admin-token \
MATHERIUM_BOOTSTRAP_SERVICES= \
ALLOW_PRIVATE_PROVIDER_URLS=true \
MAX_PROVIDER_TIMEOUT_MS=30000 \
  pnpm test:matherium-e2e
```

## Repository boundary

No changes are ever made inside `.external/matherium`. If a real
Matherium bug blocks provider integration, the correct response is to
report it precisely (SHA, failing check, request/response, repro
command, a suggested minimal Matherium-side fix) rather than patching the
checkout or weakening a MathIR-side test to route around it.

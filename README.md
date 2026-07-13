# MathIR

MathIR is a language-neutral intermediate representation for mathematical problems, expressions, statements, and reasoning steps. This repository provides deterministic validation and exact formal polynomial algebra for MathIR document version `0.1.0`, plus a standalone Matherium Capability Provider over Protocol `0.2.0`.

## Use

Requires Node.js 22+ and pnpm.

```sh
mathir validate document.json
mathir validate document.json --format json
```

The `mathir` executable is registered by `@mathir/cli`. The package has not yet been published to npm. For monorepo development:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/bin.js validate test-vectors/valid/algebra-solution.json
```

The TypeScript API is `validateMathDocument(input: unknown)` from `@mathir/validator`.

Function parameters and symbol expressions reference symbol declarations; function calls reference function declarations. When a function declares a `domain` array, it has one entry per parameter. Document `metadata` is an intentionally opaque JSON object in v0.1 and carries no standardized field semantics.

### Matherium Provider

```sh
pnpm build
MATHIR_PROVIDER_HOST=127.0.0.1 MATHIR_PROVIDER_PORT=4110 node apps/provider/dist/main.js
```

See [docs/integration/MATHERIUM_PROVIDER.md](docs/integration/MATHERIUM_PROVIDER.md) for the
service/capability contract and [docs/integration/MATHERIUM_E2E.md](docs/integration/MATHERIUM_E2E.md)
for how it's verified against a real Matherium Hub, PostgreSQL, and the external Matherium
Conformance Suite.

## Implemented

- Normative JSON Schema Draft 2020-12 for MathIR 0.1.0
- Matching strict Zod contracts and TypeScript bindings
- Stable IDs and explicit typed cross-entity references, including declaration-kind checks
- Expressions, statements, reasoning steps, source spans, annotations, assumptions, and goals; piecewise conditions reference statements
- Deterministic structural and semantic diagnostics, CLI, and canonical test vectors
- A standalone Matherium Capability Provider (`apps/provider`) implementing `mathir.validate-document@0.1.0` over Matherium Protocol `0.2.0`, with deterministic, byte-bounded output and no dependency on any `@matherium/*` package
- Exact formal polynomial normalization over rational coefficients
- Exact polynomial equivalence inside the supported formal-polynomial fragment
- Matherium capabilities `mathir.normalize-polynomial@0.1.0` and `mathir.check-polynomial-equivalence@0.1.0`
- GitHub Actions CI on Node.js 22 with lint, typecheck, build, unit/provider tests, whitespace checks, and jobs that run the real external Matherium Conformance Suite and a real Hub + PostgreSQL + Artifact end-to-end test against the provider

## Planned

- Rational-function normalization
- Domain-aware equivalence and step verification
- Natural-language parsing
- Bindings for other programming languages
- Broader Matherium capability surface beyond validation

## Non-goals

Natural-language parsing, LLM APIs, CAS integration, theorem proving, Lean ASTs, async/queued capability execution, provider authentication, npm publishing, and production deployment are not implemented in this phase. Validation checks representation consistency; it does not prove mathematics.

See [the v0.1 specification](docs/specification/MATHIR_V0_1.md) and [validation rules](docs/specification/VALIDATION.md).

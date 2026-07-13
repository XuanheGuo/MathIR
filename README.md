# MathIR

MathIR is a language-neutral intermediate representation for mathematical problems, expressions,
statements, and reasoning steps. It is a representation and reference-semantics project, not the
entire Matherium mathematics stack. This repository provides deterministic validation and exact
formal polynomial and univariate rational-function algebra for MathIR document version `0.1.0`,
plus a standalone Matherium Capability Provider over Protocol `0.2.0`.

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

MathIR v0.1 n-ary expressions require at least two operands, including `add` and `multiply`. The algebra engine's zero and one fold identities are internal implementation semantics and do not make empty n-ary MathIR expressions valid inputs.

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
- Exact univariate rational-function normalization over rational coefficients
- Compositional, canonical polynomial domain guards that survive cancellation
- Conditional rational-function equivalence with same-domain detection
- Explicit polynomial nonzero assumption discharge in `document_nonzero` mode
- Matherium capabilities `mathir.normalize-rational-function@0.1.0` and `mathir.check-rational-function-equivalence@0.1.0`
- Exact polynomial and rational algebraic identity verification
- Anchored equality rewrite verification using an unchanged MathIR expression ID
- Conditional step verification with explicit polynomial nonzero side conditions
- Structured deterministic Step evidence through `mathir.verify-algebraic-step@0.1.0`
- GitHub Actions CI on Node.js 22 with lint, typecheck, build, unit/provider tests, whitespace checks, and jobs that run the real external Matherium Conformance Suite and a real Hub + PostgreSQL + Artifact end-to-end test against the provider

## Planned within MathIR

- Representation evolution with explicit schema lifecycle and compatibility rules
- More precise validation diagnostics and source mapping
- Bindings for other programming languages
- Narrowly justified reference semantics that satisfy the admission criteria
- Provider and package usability
- Schema lifecycle tooling and test vectors

## Planned as independent Matherium services

- Formalizer for source-linked natural-language MathIR drafts with preserved uncertainty
- Counterexample Lab for exact bounded witness search
- Proof Verifier for multi-step orchestration and aggregate proof evidence
- Lean Provider for environment management and trusted-kernel evidence
- Geometry Service for geometry-specific models and reasoning
- Reasoning Diff for semantic and structural comparison of solution graphs
- Theorem Atlas for theorem identity, applicability, and dependency knowledge

The next independent mathematical service is Counterexample Lab. Its proposed v0 Capability is
`counterexample.find-expression-witness@0.1.0`; it is **planned**, not implemented here.

## Non-goals

Natural-language parsing, LLM APIs, CAS integration, theorem proving, Lean execution, equation
solution-set transformations, arbitrary substitution, inequalities, multi-step dependency proofs,
general assumption reasoning, counterexample search, geometry, cross-provider orchestration,
async/queued capability execution, provider authentication, npm publishing, and production
deployment are not implemented in MathIR. Validation checks representation consistency; exact
algebraic Step verification is not general proof checking.

See [the project boundary](docs/architecture/PROJECT_BOUNDARY.md),
[reference-semantics criteria](docs/architecture/REFERENCE_SEMANTICS.md),
[the v0.1 specification](docs/specification/MATHIR_V0_1.md), and
[validation rules](docs/specification/VALIDATION.md).

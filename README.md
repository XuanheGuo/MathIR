# MathIR

MathIR is a language-neutral intermediate representation for mathematical problems, expressions, statements, and reasoning steps. Phase 1A provides a deterministic validation pipeline: JSON Schema → semantic checks → stable diagnostics.

## Use

Requires Node.js 22+ and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/bin.js validate test-vectors/valid/algebra-solution.json
node packages/cli/dist/bin.js validate input.json --format json
```

The TypeScript API is `validateMathDocument(input: unknown)` from `@mathir/validator`.

Function parameters and symbol expressions reference symbol declarations; function calls reference function declarations. When a function declares a `domain` array, it has one entry per parameter. Document `metadata` is an intentionally opaque JSON object in v0.1 and carries no standardized field semantics.

## Implemented

- Normative JSON Schema Draft 2020-12 for MathIR 0.1.0
- Matching strict Zod contracts and TypeScript bindings
- Stable IDs and explicit typed cross-entity references, including declaration-kind checks
- Expressions, statements, reasoning steps, source spans, annotations, assumptions, and goals; piecewise conditions reference statements
- Deterministic structural and semantic diagnostics, CLI, and canonical test vectors

## Planned

- Phase 1B compatibility tooling and broader conformance vectors
- Additional deliberately specified mathematical constructs
- Bindings for other programming languages

## Non-goals

Natural-language parsing, LLM APIs, CAS integration, theorem proving, Lean ASTs, HTTP services, Matherium providers, and cloud deployment are not implemented. Validation checks representation consistency; it does not prove mathematics.

See [the v0.1 specification](docs/specification/MATHIR_V0_1.md) and [validation rules](docs/specification/VALIDATION.md).

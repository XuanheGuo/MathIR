# MathIR Project Boundary

MathIR is a representation and reference-semantics project. It is not the entire Matherium
mathematics stack.

## MathIR owns

- The normative schema and contracts for MathIR documents
- Stable references between declarations, expressions, statements, and reasoning steps
- Validation and structured diagnostics
- Source maps and source-linked representation
- Deterministic reference semantics that directly clarify MathIR
- The current exact algebra reference implementation
- The current anchored Step reference verifier
- A standalone Provider exposing those capabilities through Matherium Protocol

The current reference semantics cover exact formal-polynomial normalization and equivalence over
`Q`, exact univariate rational-function normalization and equivalence over `Q(x)`, domain guards,
explicit polynomial nonzero discharge, and structural/equality anchored Step verification. These
implementations make a bounded semantic subset precise; they are not a general proof platform.

## MathIR does not own

- A natural-language Formalizer
- A general multi-step Proof Verifier
- Counterexample Lab
- Lean execution or environment management
- Geometry models or reasoning
- Reasoning Diff
- Theorem Atlas
- ProofArena workflows or other user experiences
- Model hosting
- User accounts
- Orchestration across multiple providers

Those capabilities have independent value, runtimes, roadmaps, or implementations and therefore
belong in standalone services or applications. They integrate through Matherium Capability
contracts, Invocations, Artifacts, evidence, and Provenance rather than depending on MathIR package
internals.

## Why the current Step Verifier belongs here

It verifies a deliberately narrow semantic subset directly tied to MathIR equality Steps and
serves as a deterministic reference implementation. It must not grow into the general proof
orchestration service.

The verifier handles one anchored Step within explicit structural and algebraic bounds. It does not
own arbitrary proof dependencies, rule-provider selection, theorem search, proof-backend execution,
or proof-level aggregation. A future Proof Verifier will orchestrate those concerns and may invoke
the MathIR Step verifier as one provider of deterministic evidence.

## Service rule

Mathematical capabilities are independent Matherium services by default. Each service can run
without Matherium, owns its repository, version, tests, documentation, and release lifecycle, does
not depend on Hub internals or directly access the Hub database, and composes through versioned
Capabilities and evidence-bearing Artifacts. Deterministic and probabilistic evidence must be
distinguished explicitly.

The next independent mathematical service is Counterexample Lab. Its proposed v0 Capability,
`counterexample.find-expression-witness@0.1.0`, is **planned**, not implemented in MathIR.

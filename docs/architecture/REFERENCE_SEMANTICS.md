# MathIR Reference Semantics

## Purpose

Reference semantics are small, executable definitions that make a MathIR construct precise. They
provide deterministic interoperability anchors, not a complete mathematics engine or proof system.

## Admission criteria

A new capability may enter MathIR reference semantics only when it is:

1. Deterministic.
2. Exact.
3. Language-neutral.
4. Bounded.
5. Independent of an external CAS, LLM, or prover.
6. Directly clarifying MathIR semantics.
7. Independently testable.
8. Free of long-lived domain storage requirements.
9. Not an orchestrator of arbitrary providers.
10. Not claiming general proof completeness.

An addition must have a narrow contract, explicit supported and unsupported outcomes, stable
resource limits, test vectors, and evidence whose producer and deterministic nature are clear.
Capabilities with independent user value, runtime, persistence, deployment, competing
implementations, or multi-application demand should normally become independent services.

## Current reference semantics

### Formal polynomial over `Q`

MathIR provides exact normalization and equivalence for a bounded formal-polynomial fragment over
rational coefficients. Canonical forms and supported-expression rules define what equivalence means
inside this fragment.

### Univariate rational function over `Q(x)`

MathIR provides exact normalization and conditional equivalence for bounded univariate rational
functions. Polynomial GCD reduction and canonical denominator scaling remain exact and avoid
floating point.

### Domain guards

Rational normalization preserves compositional polynomial nonzero guards so cancellation cannot
erase original-domain restrictions. Explicitly supported polynomial nonzero assumptions may discharge
guards; unsupported assumptions remain visible rather than being guessed.

### Anchored Step verification

The reference verifier checks a deliberately narrow structural/equality Step shape anchored by an
unchanged MathIR expression ID. It combines structural checks with supported exact polynomial or
rational equality and returns deterministic accepted, rejected, conditional, unsupported, or
invalid evidence as appropriate. It does not orchestrate a proof graph.

## Deferred beyond MathIR reference semantics

- Equation solution-set transformations
- Arbitrary substitution
- Inequalities
- Multi-step dependency proofs
- General assumption reasoning
- Theorem proving
- Natural-language parsing or formalization
- Counterexample search
- Geometry
- Lean execution

These areas either change solution sets, require broader proof context or external backends, own a
domain or search lifecycle, or deliver independent service value. A future Proof Verifier,
Formalizer, Counterexample Lab, Lean Provider, Geometry Service, Reasoning Diff, or Theorem Atlas
may consume MathIR without becoming part of this repository.

Counterexample Lab is the next planned independent mathematical service. Its proposed Capability is
`counterexample.find-expression-witness@0.1.0`; neither the service nor that Capability is
implemented by this documentation change.

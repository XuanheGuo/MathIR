# Algebraic Step Verification 0.1

`@mathir/step-verifier` implements deterministic semantics
`exact-algebraic-identity-and-anchored-rewrite-step-verification-v1` for MathIR `0.1.0`.
It validates the complete document before examining a step.

## Supported inference shapes

- An **identity assertion** has no premises and an equality conclusion. The conclusion's left and
  right expression IDs are compared.
- An **anchored rewrite** has one equality premise and one equality conclusion. Exactly one
  unchanged expression ID must occur on a side of both equalities. Equality-side swaps are
  supported. The two non-anchor expressions are compared.
- Exact-ID reflexivity (`a = a`), no-op (`a = b` to `a = b`), and symmetry (`a = b` to `b = a`)
  are verified structurally without invoking an algebra engine.

The anchor is never inferred from names, source spans, array positions, or algebraic equivalence.
A transformation such as `x + 1 = 2` to `x = 1` has no shared anchor and is `unknown`, even though
it may preserve a solution set. Zero or one premise is supported; multiple premises are `unknown`.

Only `equivalence/simplification` and `equivalence/algebraic_rearrangement` are supported. A step
may omit `status` or use `parsed`. Substitution, definition expansion, implication, assertion,
unknown rules, and partial/unparsed steps are `unknown`. Dependencies are recorded but are not
recursively verified and their conclusions are not assumptions.

## Verification modes

- `polynomial` uses exact commutative polynomial equivalence over rational coefficients.
- `rational_function` uses exact univariate rational-function equivalence and compositional
  polynomial domain guards.
- `auto` first uses polynomial equivalence. It falls back to rational functions only when every
  polynomial issue is `NON_CONSTANT_DIVISOR` or `INVALID_EXPONENT`. Missing expressions,
  unsupported syntax, division by zero, cycles, and resource-limit issues do not trigger fallback.

## Declared conditions

The required `conditionMode` selects no conditions (`ignore`), document assumptions
(`document_nonzero`), step side conditions (`step_nonzero`), or both sources
(`document_and_step_nonzero`). Set-like output arrays are deduplicated and code-unit sorted;
document and step source attribution is retained separately.

Recognized conditions are exactly `nonzero(p)`, `p != 0`, and `0 != p`, where `p` is a supported
univariate polynomial. Positive/nonnegative/defined predicates, arbitrary equalities, compound
statements, rational nonzero expressions, and multivariate conditions are unsupported and cannot
discharge a guard. Unsupported conditions are not false and are not fatal.

A selected step side condition is trusted as a declared condition. The verifier does **not** prove
it, trace it to a dependency, or establish that every side condition is independently justified.
Thus “verified with selected conditions” does not mean “all side conditions proven.”

## Outcomes and evidence

- `verified`: a structural inference, exact polynomial identity, same-domain rational identity, or
  a rational guard discharged by selected conditions.
- `conditionally_verified`: rational values agree but an additional domain guard is still needed.
- `rejected`: both expressions entered the same exact engine and their values differ.
- `unknown`: unsupported shape/rule/fragment, missing step, or resource failure.
- `invalid_document`: complete MathIR validation failed; no step extraction or algebra ran.

Evidence is a discriminated union. Structural evidence names the transformation. Polynomial
evidence carries both canonical forms. Rational evidence carries both value forms, both domain
guards, and the required guard. A normal form may be `null` to preserve partial evidence for an
unsupported side. Evidence is never truncated.

Default limits combine the algebra and rational-function limits with 512 selected conditions and
700 KiB of UTF-8 serialized evidence. Issue cardinality is structurally bounded by the supported
one-step shape and the two algebraic sides; Phase 2C does not expose issue truncation. Limit
failures are deterministic and never use wall-clock time.

Condition-analysis completion is determined by explicit coverage of every selected statement ID
in the recognized/unsupported classification union. Unsupported conditions therefore count as
completed analysis. Missing classification coverage means condition analysis is unavailable;
rational failures after complete classification remain attributed to the rational-function phase.

## Non-goals

Equation solution-set transformations without a shared anchor, multi-premise reasoning,
dependency proof validation, substitution, definition expansion, inequalities, implications,
general proof checking, CAS/LLM/Lean integration, and multivariate rational functions are outside
this version.

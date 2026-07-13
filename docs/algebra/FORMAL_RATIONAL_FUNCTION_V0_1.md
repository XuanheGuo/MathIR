# Exact Univariate Rational-Function Semantics v0.1

`formal-univariate-rational-function-over-rationals-with-domain-guards-v1` interprets a selected expression as an exact element of `Q(x)` plus a polynomial nonzero guard describing where the original expression graph is defined. It is deterministic formal algebra, not general real-function equivalence or a CAS.

## Boundary and supported expressions

The full dependency graph may contain at most one distinct symbol `declarationId`. Constants have `variableDeclarationId: null`; a constant and a one-variable expression may be compared. Different declaration IDs are multivariate even when their names match and produce `MULTIVARIATE_NOT_SUPPORTED` (`unsupported` for normalization, `unknown` for equivalence).

Exact integer, fixed-point decimal, and rational literals reuse the Phase 2A `BigInt` rational parser; floating point is never used. Accepted symbol domains are omitted, `unknown`, `natural`, `integer`, `rational`, and `real`. Supported operations are unary `negate`, binary `subtract`, `divide`, and `power`, and n-ary `add` and `multiply`. MathIR v0.1 still requires at least two n-ary operands. Boolean/set symbols, absolute value, logic, function calls, piecewise, and unparsed expressions are unsupported.

Power accepts exact integer constants from -256 through 256. Positive powers raise numerator and denominator; negative powers swap them and add the reduced numerator as a nonzero guard. A zero numerator under a negative power is `DIVISION_BY_ZERO`. Zero power yields one but retains every guard already required to evaluate its base (and exponent). Thus `(1/x)^0` is `1` with guard `x`, while the project's formal convention keeps `0^0 = 1`.

## Value normal form

The public `formal-univariate-rational-function` contains a Phase 2A `PolynomialNormalForm` numerator and denominator. Exact long division and Euclidean GCD over `Q[x]` remove their common polynomial divisor. The denominator is scaled to monic; zero is always `0/1`; coefficients are reduced canonical rationals. Ordering uses code-unit comparisons and numeric degrees, never insertion order or locale rules.

Examples: `(2x+2)/(4x+4)` has value `1/2`; `1/(-x)` has value `-1/x` with monic denominator `x`; and `0/(x-1)` has value `0/1` but still has guard `x-1`.

## Compositional domain guards

`domainGuard: null` means unrestricted. Otherwise the original expression is defined where the canonical polynomial guard is nonzero. Guards are monic and square-free. Conjunction is the square-free part of the product because over `Q[x]`, `p != 0` and `q != 0` exactly when `pq != 0`. Constant nonzero guards become `null`; a zero guard becomes `DIVISION_BY_ZERO`. No roots are solved and no factorization is performed.

Division of `a/b` by `c/d` computes value `ad/(bc)`, inherits both child guards, and adds reduced `c != 0`. Value cancellation never deletes provenance: `(x²-1)/(x-1)` has value `x+1`, guard `x-1`; `x/x` has value `1`, guard `x`; and both `1/(1/x)` and `(1/x)/(1/x)` retain guard `x`.

## Same-domain and conditional equivalence

Values are compared exactly in `Q(x)`. If they differ the outcome is `not_equivalent`, meaning only that they are different rational functions—not that no pointwise condition could make their values equal. Unsupported sides produce `unknown`; invalid MathIR is rejected before algebra.

For equal values, `null` guards are treated as one. Let `common = gcd(gL,gR)`, `extraL = gL/common`, and `extraR = gR/common`. The required guard is the square-free monic product `extraL*extraR`. Shared restrictions therefore require no additional condition: `1/x` versus `1/x`, and `1/x` versus `x/x²`, are `equivalent`. `x/x` versus `1` is `conditionally_equivalent` with required guard `x`; the cancellation example versus `x+1` requires `x-1`.

## Explicit nonzero assumptions

Every new capability requires `assumptionMode`. `ignore` returns empty assumption analysis. `document_nonzero` reads only IDs in `document.assumptions` and recognizes `nonzero(p)`, `p != 0`, and `0 != p` when `p` is a supported univariate Phase 2A polynomial. Positive/nonnegative/defined predicates, equality, inequalities, compound logic, goals, steps, non-assumption statements, rational expressions, multivariate expressions, and zero-polynomial nonzero claims are unsupported and never used.

Recognized polynomials form a square-free monic aggregate `assumptionGuard`. A required guard `R` is discharged exactly when `assumptionGuard mod R = 0`. Consequently `x²-1 != 0` discharges `x-1 != 0`, but the reverse does not. Assumptions never rewrite values: even `x = 1` does not make `x` equivalent to `1`.

## Determinism and limits

The expression DAG is memoized with cycle detection. Phase 2A bounds remain, plus polynomial degree 256, 257 univariate terms, 1,024 long-division steps, 512 GCD steps, domain-guard degree 256, 512 assumptions, and 300 KiB UTF-8 rational normal form. Limits are checked at stable structural boundaries; no wall-clock timeout or sampling decides a mathematical result, and terms, guards, or assumptions are never silently dropped.

Normalization outcomes are `normalized`, `unsupported`, and `invalid_document`. Equivalence outcomes are `equivalent`, `conditionally_equivalent`, `not_equivalent`, `unknown`, and `invalid_document`. This phase does not implement multivariate rational functions, arbitrary assumption inference, inequality reasoning, factorization, root solving, general expression equivalence, theorem proving, step verification, or natural-language parsing.

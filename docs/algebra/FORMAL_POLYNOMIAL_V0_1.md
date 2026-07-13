# Exact Formal Polynomial Semantics v0.1

`formal-commutative-polynomial-over-rationals-v1` interprets a selected, validated MathIR expression as an element of the formal commutative polynomial ring over `Q`. It is deterministic symbolic algebra, not general mathematical equivalence: it does not inspect real-function domains, assumptions, goals, predicates, or source text.

## Supported fragment

Each supported `symbol` declaration is one formal indeterminate identified exclusively by `declarationId`; names and expression IDs have no algebraic identity. Omitted, `unknown`, `natural`, `integer`, `rational`, and `real` domains are accepted. `boolean` and `set` produce `UNSUPPORTED_SYMBOL_DOMAIN`.

Supported expressions are exact `number`, `symbol`, unary `negate`, binary `subtract`, restricted `divide` and `power`, and n-ary `add` and `multiply`. MathIR v0.1 n-ary expressions require at least two operands, so empty and unary `add` or `multiply` documents are invalid and algebra is not attempted. Internally, polynomial addition uses zero as its fold identity and polynomial multiplication uses one as its fold identity. Function calls, piecewise, unparsed expressions, absolute value, logical operators, and all other operators are unsupported.

Division is allowed only by a nonzero constant polynomial. Thus `x/2` and `(x+1)/(-3/4)` are supported, while `x/y`, `x/(x+1)`, and cancellable rational expressions are not. Zero produces `DIVISION_BY_ZERO`; a variable divisor produces `NON_CONSTANT_DIVISOR`.

Power requires an exponent that normalizes to an exact integer constant in `[0,256]`. It uses exponentiation by squaring. Variable, negative, fractional, decimal-noninteger, or excessive exponents produce `INVALID_EXPONENT`. In ring semantics `x^0 = 1`; no claim about real-function definedness is implied.

## Exact numbers

Algebra never passes through JavaScript `number`. Native `BigInt` implements reduced rationals with positive denominator, canonical sign, and canonical zero `0/1`.

- Integer: `^[+-]?[0-9]+$`
- Fixed decimal: `^[+-]?(?:[0-9]+\.[0-9]*|[0-9]*\.[0-9]+)$`
- Rational: two signed decimal integers separated by one `/`

When `numberKind` exists the literal must match it; otherwise `/`, then `.`, then integer syntax determines the kind. Input is never trimmed. Scientific notation, whitespace, non-finite spellings, malformed fractions, and empty text produce `INVALID_NUMBER_LITERAL`; denominator zero produces `DIVISION_BY_ZERO`. Examples: `0.1 = 1/10`, `-12.250 = -49/4`, `3/-4 = -3/4`, and `-6/-8 = 3/4`.

## Canonical normal form

The public form has `kind: formal-polynomial`, `coefficientDomain: rational`, and an array of nonzero terms. Each coefficient is `{numerator, denominator}` using decimal strings. Each term's positive powers are unique and sorted by declaration ID using ASCII/code-unit comparison. Terms with identical powers are combined and zeros removed.

The monomial key is `declarationId^exponent` joined with `*`. Terms are sorted by this key using code-unit comparison, never locale ordering or map insertion order. The constant key is empty and sorts first. Zero has `terms: []`; one has one coefficient `1/1` term with empty powers.

## Outcomes and boundaries

Normalization returns `normalized`, `unsupported`, or `invalid_document`. Equivalence returns `equivalent` only for identical successful canonical forms, `not_equivalent` only for two different successful forms, `unknown` whenever either side cannot be normalized, and `invalid_document` before algebra whenever full MathIR validation fails. Successful one-sided forms may be retained for `unknown`. Issues are stable and left-side issues precede right-side issues.

Examples include `(x+1)^2 ≡ x^2+2*x+1`, `x/2+x/3 ≡ 5*x/6`, `0.1+0.2 ≡ 0.3`, and `x-x ≡ 0`. `x+1` is not equivalent to `x`. `x/x ?= 1`, `abs(x) ?= x`, function calls, and piecewise expressions are unknown, never sampled and never reported as not equivalent.

## Deterministic resource limits

Defaults are 10,000 visited expressions, depth 512, 4,096 terms, exponent and total degree 256, 1,024 integer-literal digits, 4,096 coefficient bits, and 300 KiB UTF-8 serialized normal form. Expression DAGs are memoized; cycles use visiting state. Bounds are checked after structural algebra operations and coefficient operations. Exceeding a limit returns a stable domain issue without truncating terms. No wall-clock timeout decides mathematics.

## Non-goals

This version does not implement rational-function normalization, domain-aware or assumption-aware reasoning, numerical sampling, general CAS behavior, automatic proof, Lean, natural-language parsing, function calls, absolute value, or piecewise semantics.

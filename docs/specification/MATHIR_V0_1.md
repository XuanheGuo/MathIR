# MathIR v0.1

The normative serialization is JSON conforming to `mathir-document-0.1.0.schema.json`. A document has version `0.1.0`, a stable document ID, a kind, and arrays of declarations, expressions, statements, reasoning steps, assumptions, and goals.

IDs match `^[A-Za-z][A-Za-z0-9._:-]{0,127}$`. Source, declaration, expression, statement, step, and annotation namespaces are independent. References always name the expected namespace and never rely on array position.

Declarations cover symbols and functions. Domains intentionally cover only natural, integer, rational, real, boolean, set, and unknown. Expressions are tagged as number, symbol, unary, binary, nary, function call, piecewise, or unparsed. Numeric values are strings. Statements are relations, predicates, or compound statements. Steps connect statement premises to a conclusion, explicitly name earlier step dependencies and side conditions, and distinguish equivalence, implication, assertion, and unknown rules.

An `unparsed` expression preserves raw input and an honest reason. It is not interpreted as verified mathematics. Equivalence and implication remain distinct even though v0.1 does not prove that a declared rule was correctly applied.

Source spans use zero-based UTF-16 code-unit offsets with inclusive `start` and exclusive `end`, matching JavaScript string slicing. When source content is embedded, the validator checks the upper bound; for external-only sources it checks non-negativity and ordering.

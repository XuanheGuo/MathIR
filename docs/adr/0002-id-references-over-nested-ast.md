# ADR 0002: ID references over nested ASTs

Status: accepted.

Expressions, statements, and steps are flat entity collections connected by stable typed IDs. This supports source tracking, annotations, reuse, graph reasoning, and deterministic diagnostics without array-position identity. It costs explicit indexing and reference validation, which the validator provides.

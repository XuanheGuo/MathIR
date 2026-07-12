# Validation

Validation runs in a fixed order: JSON Schema; version; per-namespace indexes and duplicates; typed references; source-span bounds; function declaration domain arity and function-call/operator/compound arity; step ordering; dependency cycles; stable sorting.

Structural failure stops semantic passes, preventing malformed unknown input from crashing the validator. A result is valid exactly when it has no error diagnostics; warnings do not invalidate it. Declaration IDs are checked for existence and expected kind. Piecewise conditions use the statement index; branch values and `otherwise` use the expression index. The validator checks declarations and local consistency, not truth, equivalence, implication, or proof validity.

Step dependencies must refer to earlier array entries. This is the sole place where ordering has a semantic constraint; entities are otherwise referenced by ID. Diagnostics sort by severity, path, code, entity kind, and entity ID.

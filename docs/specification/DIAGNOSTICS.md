# Diagnostics

Diagnostics contain a stable `code`, `severity`, human message, optional JSON-style path, owning entity, and related entities. Codes are centrally exported as `DIAGNOSTIC_CODES`.

Structural/version: `SCHEMA_INVALID`, `UNSUPPORTED_VERSION`. Identity and source: `DUPLICATE_ID`, `UNKNOWN_SOURCE_REFERENCE`, `INVALID_SOURCE_SPAN`. Typed references: `UNKNOWN_DECLARATION_REFERENCE`, `UNKNOWN_EXPRESSION_REFERENCE`, `UNKNOWN_STATEMENT_REFERENCE`, `UNKNOWN_STEP_REFERENCE`, `INVALID_GOAL_REFERENCE`, `INVALID_ASSUMPTION_REFERENCE`, `INVALID_ANNOTATION_TARGET`. Local semantics: `INVALID_FUNCTION_ARITY`, `INVALID_COMPOUND_ARITY`, `INVALID_OPERATOR_ARITY`, `INVALID_CONFIDENCE`, `FORWARD_STEP_DEPENDENCY`, `CYCLIC_STEP_DEPENDENCY`.

The CLI additionally emits `INVALID_JSON` when the file cannot be parsed as JSON.

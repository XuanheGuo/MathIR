# Diagnostics

Diagnostics contain a stable `code`, `severity`, human message, optional JSON-style path, owning entity, and related entities. Codes are centrally exported as `DIAGNOSTIC_CODES`.

Structural/version: `SCHEMA_INVALID`, `UNSUPPORTED_VERSION`. Identity and source: `DUPLICATE_ID`, `UNKNOWN_SOURCE_REFERENCE`, `INVALID_SOURCE_SPAN`. For declarations, `UNKNOWN_DECLARATION_REFERENCE` means the ID is absent, while `INVALID_DECLARATION_KIND` means it exists with the wrong kind. Other typed-reference codes are `UNKNOWN_EXPRESSION_REFERENCE`, `UNKNOWN_STATEMENT_REFERENCE`, `UNKNOWN_STEP_REFERENCE`, `INVALID_GOAL_REFERENCE`, `INVALID_ASSUMPTION_REFERENCE`, and `INVALID_ANNOTATION_TARGET`. Local semantics: `INVALID_FUNCTION_ARITY` covers declaration domain/parameter mismatch and function-call argument mismatch with distinct paths and messages; the remaining codes are `INVALID_COMPOUND_ARITY`, `INVALID_OPERATOR_ARITY`, `INVALID_CONFIDENCE`, `FORWARD_STEP_DEPENDENCY`, and `CYCLIC_STEP_DEPENDENCY`.

The CLI additionally emits `INVALID_JSON` when the file cannot be parsed as JSON.

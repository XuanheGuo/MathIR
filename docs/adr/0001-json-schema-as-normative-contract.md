# ADR 0001: JSON Schema is normative

Status: accepted.

JSON Schema Draft 2020-12 is the language-neutral normative contract. Zod is a TypeScript runtime binding maintained by hand. Strict-Ajv compilation and conformance tests run shared valid and invalid examples through both representations to detect drift. Schema changes require matching binding and vector changes.

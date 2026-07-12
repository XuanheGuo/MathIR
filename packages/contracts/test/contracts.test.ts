import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { mathDocumentSchema } from '../src/index.js';

const schema = JSON.parse(
  readFileSync(new URL('../schema/mathir-document-0.1.0.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv2020.default({ strict: true, allErrors: true }).compile(schema);
const minimal = JSON.parse(
  readFileSync(
    new URL('../../../test-vectors/valid/minimal-problem.json', import.meta.url),
    'utf8',
  ),
);

describe('normative contract', () => {
  it('compiles in Ajv strict mode and accepts the minimal document', () =>
    expect(validate(minimal)).toBe(true));
  it('keeps Zod and JSON Schema aligned on canonical vectors', () => {
    expect(mathDocumentSchema.safeParse(minimal).success).toBe(validate(minimal));
    const malformed = { ...minimal, extra: true };
    expect(mathDocumentSchema.safeParse(malformed).success).toBe(validate(malformed));
  });
});

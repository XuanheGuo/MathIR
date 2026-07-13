export const ID_PATTERN = '^[A-Za-z][A-Za-z0-9._:-]{0,127}$';
export const RATIONAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['numerator', 'denominator'],
  properties: {
    numerator: { type: 'string', pattern: '^-?[0-9]+$' },
    denominator: { type: 'string', pattern: '^[1-9][0-9]*$' },
  },
} as const;
export const POWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['declarationId', 'exponent'],
  properties: {
    declarationId: { type: 'string', pattern: ID_PATTERN },
    exponent: { type: 'integer', minimum: 1 },
  },
} as const;
export const NORMAL_FORM_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['kind', 'coefficientDomain', 'terms'],
  properties: {
    kind: { const: 'formal-polynomial' },
    coefficientDomain: { const: 'rational' },
    terms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['coefficient', 'powers'],
        properties: {
          coefficient: RATIONAL_SCHEMA,
          powers: { type: 'array', items: POWER_SCHEMA },
        },
      },
    },
  },
} as const;
export const ISSUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    expressionId: { type: 'string' },
    path: { type: 'string' },
    side: { enum: ['left', 'right'] },
  },
} as const;
export const DIAGNOSTIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'severity', 'message'],
  properties: {
    code: { type: 'string' },
    severity: { enum: ['error', 'warning'] },
    message: { type: 'string' },
    path: { type: 'string' },
    entity: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { type: 'string' }, id: { type: 'string' } },
    },
    related: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'id'],
        properties: { kind: { type: 'string' }, id: { type: 'string' } },
      },
    },
  },
} as const;
export const COMMON_ALGEBRA_OUTPUT_PROPERTIES = {
  semantics: { const: 'formal-commutative-polynomial-over-rationals-v1' },
  issues: { type: 'array', items: ISSUE_SCHEMA },
  validationDiagnostics: { type: 'array', items: DIAGNOSTIC_SCHEMA },
  totalValidationDiagnostics: { type: 'integer', minimum: 0 },
  validationDiagnosticsTruncated: { type: 'boolean' },
} as const;

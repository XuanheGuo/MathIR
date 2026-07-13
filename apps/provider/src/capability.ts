import { idSchema } from '@mathir/contracts';
import { type Diagnostic, validateMathDocument } from '@mathir/validator';
import Ajv2020 from 'ajv/dist/2020.js';
import { z } from 'zod';
import { OUTPUT_BYTE_BUDGET } from './constants.js';
import { type JsonValue, isJsonValue } from './protocol.js';

export interface ValidateDocumentInput {
  document: JsonValue;
}

export interface ValidateDocumentOutputDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  entity?: { kind: string; id?: string };
  related?: { kind: string; id: string }[];
}

export interface ValidateDocumentOutput {
  valid: boolean;
  documentId: string | null;
  declaredMathirVersion: string | null;
  diagnostics: ValidateDocumentOutputDiagnostic[];
  totalDiagnostics: number;
  diagnosticsTruncated: boolean;
}

const DECLARED_VERSION_MAX_LENGTH = 64;

export const VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/validate-document-input-0.1.0.schema.json',
  title: 'mathir.validate-document input',
  type: 'object',
  additionalProperties: false,
  required: ['document'],
  properties: {
    document: {},
  },
} as const;

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const validateDocumentInputSchema = z.object({ document: jsonValueSchema }).strict();

const diagnosticEntitySchema = z.object({ kind: z.string(), id: z.string().optional() }).strict();
const diagnosticRelatedSchema = z.object({ kind: z.string(), id: z.string() }).strict();
export const validateDocumentOutputDiagnosticSchema = z
  .object({
    code: z.string(),
    severity: z.enum(['error', 'warning']),
    message: z.string(),
    path: z.string().optional(),
    entity: diagnosticEntitySchema.optional(),
    related: z.array(diagnosticRelatedSchema).optional(),
  })
  .strict();

export const validateDocumentOutputSchema = z
  .object({
    valid: z.boolean(),
    documentId: z.string().nullable(),
    declaredMathirVersion: z.string().nullable(),
    diagnostics: z.array(validateDocumentOutputDiagnosticSchema),
    totalDiagnostics: z.number().int().nonnegative(),
    diagnosticsTruncated: z.boolean(),
  })
  .strict();

export const VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://mathir.org/schema/provider/validate-document-output-0.1.0.schema.json',
  title: 'mathir.validate-document output',
  type: 'object',
  additionalProperties: false,
  required: [
    'valid',
    'documentId',
    'declaredMathirVersion',
    'diagnostics',
    'totalDiagnostics',
    'diagnosticsTruncated',
  ],
  properties: {
    valid: { type: 'boolean' },
    documentId: { type: ['string', 'null'] },
    declaredMathirVersion: { type: ['string', 'null'] },
    diagnostics: {
      type: 'array',
      items: {
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
      },
    },
    totalDiagnostics: { type: 'integer', minimum: 0 },
    diagnosticsTruncated: { type: 'boolean' },
  },
} as const;

const ajv = new Ajv2020.default({ strict: true });
export const validateInputStructure = ajv.compile(VALIDATE_DOCUMENT_INPUT_JSON_SCHEMA);
export const validateOutputStructure = ajv.compile(VALIDATE_DOCUMENT_OUTPUT_JSON_SCHEMA);

export interface ParsedInputSuccess {
  ok: true;
  input: ValidateDocumentInput;
}
export interface ParsedInputFailure {
  ok: false;
  message: string;
}
export type ParsedInputResult = ParsedInputSuccess | ParsedInputFailure;

export function parseValidateDocumentInput(raw: unknown): ParsedInputResult {
  if (!validateInputStructure(raw)) {
    return {
      ok: false,
      message: 'input does not match the mathir.validate-document input contract',
    };
  }
  const document = (raw as { document: unknown }).document;
  if (!isJsonValue(document)) {
    return { ok: false, message: 'document must be a JSON value' };
  }
  return { ok: true, input: { document } };
}

function extractStringField(document: JsonValue, key: string): string | null {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return null;
  const value = document[key];
  return typeof value === 'string' ? value : null;
}

function safeDocumentId(document: JsonValue): string | null {
  const raw = extractStringField(document, 'documentId');
  if (raw === null) return null;
  return idSchema.safeParse(raw).success ? raw : null;
}

function safeDeclaredMathirVersion(document: JsonValue): string | null {
  const raw = extractStringField(document, 'mathirVersion');
  if (raw === null) return null;
  return raw.length > 0 && raw.length <= DECLARED_VERSION_MAX_LENGTH ? raw : null;
}

function toOutputDiagnostic(diagnostic: Diagnostic): ValidateDocumentOutputDiagnostic {
  const out: ValidateDocumentOutputDiagnostic = {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
  };
  if (diagnostic.path !== undefined) out.path = diagnostic.path;
  if (diagnostic.entity !== undefined) out.entity = diagnostic.entity;
  if (diagnostic.related !== undefined) out.related = diagnostic.related;
  return out;
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Finds the longest stable diagnostics prefix whose serialized output fits the byte
 * budget via binary search, avoiding O(n^2) re-serialization of the full array.
 */
function boundOutput(full: ValidateDocumentOutput): ValidateDocumentOutput {
  if (byteSize(full) <= OUTPUT_BYTE_BUDGET) return full;
  const diagnostics = full.diagnostics;
  let lo = 0;
  let hi = diagnostics.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate: ValidateDocumentOutput = {
      ...full,
      diagnostics: diagnostics.slice(0, mid),
      diagnosticsTruncated: mid < diagnostics.length,
    };
    if (byteSize(candidate) <= OUTPUT_BYTE_BUDGET) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return {
    ...full,
    diagnostics: diagnostics.slice(0, lo),
    diagnosticsTruncated: lo < diagnostics.length,
  };
}

export function executeValidateDocument(input: ValidateDocumentInput): ValidateDocumentOutput {
  const result = validateMathDocument(input.document);
  const diagnostics = result.diagnostics.map(toOutputDiagnostic);
  const full: ValidateDocumentOutput = {
    valid: result.valid,
    documentId: safeDocumentId(input.document),
    declaredMathirVersion: safeDeclaredMathirVersion(input.document),
    diagnostics,
    totalDiagnostics: diagnostics.length,
    diagnosticsTruncated: false,
  };
  return boundOutput(full);
}

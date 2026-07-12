import { z } from 'zod';
export const MATHIR_VERSION = '0.1.0' as const;
export const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/);
export type Domain =
  | { kind: 'natural' | 'integer' | 'rational' | 'real' | 'boolean' }
  | { kind: 'set'; elementDomain?: Domain | undefined }
  | { kind: 'unknown'; description?: string | undefined };
export const domainSchema: z.ZodType<Domain> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('natural') }).strict(),
    z.object({ kind: z.literal('integer') }).strict(),
    z.object({ kind: z.literal('rational') }).strict(),
    z.object({ kind: z.literal('real') }).strict(),
    z.object({ kind: z.literal('boolean') }).strict(),
    z.object({ kind: z.literal('set'), elementDomain: domainSchema.optional() }).strict(),
    z.object({ kind: z.literal('unknown'), description: z.string().optional() }).strict(),
  ]),
);
export const sourceSpanSchema = z
  .object({
    sourceId: idSchema,
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .strict();
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export const sourceDocumentSchema = z
  .object({
    id: idSchema,
    mediaType: z.enum(['text/plain', 'text/markdown', 'application/x-latex']),
    content: z.string().optional(),
    uri: z.string().optional(),
    sha256: z
      .string()
      .regex(/^[A-Fa-f0-9]{64}$/)
      .optional(),
  })
  .strict();
const located = { sourceSpan: sourceSpanSchema.optional() };
export const declarationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: idSchema,
      kind: z.literal('symbol'),
      name: z.string().min(1),
      domain: domainSchema.optional(),
      ...located,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      kind: z.literal('function'),
      name: z.string().min(1),
      parameters: z.array(idSchema),
      domain: z.array(domainSchema).optional(),
      codomain: domainSchema.optional(),
      ...located,
    })
    .strict(),
]);
const eb = { id: idSchema, ...located, inferredDomain: domainSchema.optional() };
export interface PiecewiseBranch {
  condition: string; // statement ID
  value: string; // expression ID
}
export const piecewiseBranchSchema: z.ZodType<PiecewiseBranch> = z
  .object({ condition: idSchema, value: idSchema })
  .strict();
export const expressionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...eb,
      kind: z.literal('number'),
      value: z.string(),
      numberKind: z.enum(['integer', 'decimal', 'rational']).optional(),
    })
    .strict(),
  z.object({ ...eb, kind: z.literal('symbol'), declarationId: idSchema }).strict(),
  z
    .object({
      ...eb,
      kind: z.literal('unary'),
      operator: z.enum(['negate', 'absolute', 'not']),
      operand: idSchema,
    })
    .strict(),
  z
    .object({
      ...eb,
      kind: z.literal('binary'),
      operator: z.enum(['subtract', 'divide', 'power', 'implies', 'iff']),
      left: idSchema,
      right: idSchema,
    })
    .strict(),
  z
    .object({
      ...eb,
      kind: z.literal('nary'),
      operator: z.enum(['add', 'multiply', 'and', 'or']),
      operands: z.array(idSchema),
    })
    .strict(),
  z
    .object({
      ...eb,
      kind: z.literal('function_call'),
      functionDeclarationId: idSchema,
      arguments: z.array(idSchema),
    })
    .strict(),
  z
    .object({
      ...eb,
      kind: z.literal('piecewise'),
      branches: z.array(piecewiseBranchSchema).min(1),
      otherwise: idSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...eb,
      kind: z.literal('unparsed'),
      raw: z.string(),
      reason: z.enum(['unsupported_syntax', 'ambiguous', 'incomplete', 'parser_failure']),
      candidates: z.array(idSchema).optional(),
    })
    .strict(),
]);
export const statementSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: idSchema,
      kind: z.literal('relation'),
      relation: z.enum([
        'equal',
        'not_equal',
        'less_than',
        'less_than_or_equal',
        'greater_than',
        'greater_than_or_equal',
        'element_of',
        'subset_of',
      ]),
      left: idSchema,
      right: idSchema,
      ...located,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      kind: z.literal('predicate'),
      predicate: z.enum(['defined', 'nonzero', 'positive', 'nonnegative']),
      arguments: z.array(idSchema),
      ...located,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      kind: z.literal('compound'),
      connective: z.enum(['and', 'or', 'not', 'implies', 'iff']),
      operands: z.array(idSchema),
      ...located,
    })
    .strict(),
]);
export const reasoningRuleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('equivalence'),
      name: z.enum([
        'simplification',
        'algebraic_rearrangement',
        'substitution',
        'definition_expansion',
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('implication'),
      name: z.enum(['apply_inequality', 'case_analysis', 'modus_ponens', 'specialization']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('assertion'),
      name: z.enum(['given', 'derived', 'external_result']),
      reference: z.string().optional(),
    })
    .strict(),
  z.object({ kind: z.literal('unknown'), raw: z.string().optional() }).strict(),
]);
export const reasoningStepSchema = z
  .object({
    id: idSchema,
    premises: z.array(idSchema),
    conclusion: idSchema,
    dependencies: z.array(idSchema),
    rule: reasoningRuleSchema,
    sideConditions: z.array(idSchema),
    status: z.enum(['parsed', 'partial', 'unparsed']).optional(),
    confidence: z.number().optional(),
    ...located,
  })
  .strict();
export const annotationSchema = z
  .object({
    id: idSchema,
    target: z.object({ kind: z.enum(['expression', 'statement', 'step']), id: idSchema }).strict(),
    severity: z.enum(['info', 'warning', 'error']),
    code: z.string().min(1),
    message: z.string(),
    ...located,
  })
  .strict();
export const mathDocumentSchema = z
  .object({
    mathirVersion: z.string(),
    documentId: idSchema,
    kind: z.enum(['problem', 'solution', 'combined']),
    metadata: z.record(z.unknown()).optional(),
    sources: z.array(sourceDocumentSchema).optional(),
    declarations: z.array(declarationSchema),
    expressions: z.array(expressionSchema),
    statements: z.array(statementSchema),
    steps: z.array(reasoningStepSchema),
    assumptions: z.array(idSchema),
    goals: z.array(idSchema),
    annotations: z.array(annotationSchema).optional(),
  })
  .strict();
export type MathDocument = z.infer<typeof mathDocumentSchema>;
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
export type Declaration = z.infer<typeof declarationSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type Statement = z.infer<typeof statementSchema>;
export type ReasoningStep = z.infer<typeof reasoningStepSchema>;
export type Annotation = z.infer<typeof annotationSchema>;

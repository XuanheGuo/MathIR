import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MATHIR_VERSION,
  type MathDocument,
  type SourceSpan,
  mathDocumentSchema,
} from '@mathir/contracts';
import Ajv2020, { type AnySchema, type ErrorObject } from 'ajv/dist/2020.js';
export const DIAGNOSTIC_CODES = {
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  DUPLICATE_ID: 'DUPLICATE_ID',
  UNKNOWN_SOURCE_REFERENCE: 'UNKNOWN_SOURCE_REFERENCE',
  INVALID_SOURCE_SPAN: 'INVALID_SOURCE_SPAN',
  UNKNOWN_DECLARATION_REFERENCE: 'UNKNOWN_DECLARATION_REFERENCE',
  UNKNOWN_EXPRESSION_REFERENCE: 'UNKNOWN_EXPRESSION_REFERENCE',
  UNKNOWN_STATEMENT_REFERENCE: 'UNKNOWN_STATEMENT_REFERENCE',
  UNKNOWN_STEP_REFERENCE: 'UNKNOWN_STEP_REFERENCE',
  FORWARD_STEP_DEPENDENCY: 'FORWARD_STEP_DEPENDENCY',
  CYCLIC_STEP_DEPENDENCY: 'CYCLIC_STEP_DEPENDENCY',
  INVALID_FUNCTION_ARITY: 'INVALID_FUNCTION_ARITY',
  INVALID_COMPOUND_ARITY: 'INVALID_COMPOUND_ARITY',
  INVALID_OPERATOR_ARITY: 'INVALID_OPERATOR_ARITY',
  INVALID_CONFIDENCE: 'INVALID_CONFIDENCE',
  INVALID_GOAL_REFERENCE: 'INVALID_GOAL_REFERENCE',
  INVALID_ASSUMPTION_REFERENCE: 'INVALID_ASSUMPTION_REFERENCE',
  INVALID_ANNOTATION_TARGET: 'INVALID_ANNOTATION_TARGET',
} as const;
export type EntityKind =
  | 'document'
  | 'source'
  | 'declaration'
  | 'expression'
  | 'statement'
  | 'step'
  | 'annotation';
export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  entity?: { kind: EntityKind; id?: string };
  related?: { kind: string; id: string }[];
}
export interface ValidationResult {
  valid: boolean;
  document?: MathDocument;
  diagnostics: Diagnostic[];
}
const schema = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../contracts/schema/mathir-document-0.1.0.schema.json', import.meta.url),
    ),
    'utf8',
  ),
) as AnySchema;
const structural = new Ajv2020.default({ strict: true, allErrors: true }).compile(schema);
const sd = (e: ErrorObject): Diagnostic => ({
  code: 'SCHEMA_INVALID',
  severity: 'error',
  path:
    `${e.instancePath}${e.keyword === 'required' ? `/${String(e.params.missingProperty)}` : ''}` ||
    '/',
  message: `${e.keyword}: ${e.message ?? 'invalid value'}`,
});
const d = (
  code: string,
  path: string,
  message: string,
  kind: EntityKind,
  id?: string,
): Diagnostic => ({
  code,
  severity: 'error',
  path,
  message,
  entity: id === undefined ? { kind } : { kind, id },
});
const sort = (a: Diagnostic[]) =>
  a.sort((x, y) => {
    const left: string[] = [
      x.severity,
      x.path ?? '',
      x.code,
      x.entity?.kind ?? '',
      x.entity?.id ?? '',
    ];
    const right: string[] = [
      y.severity,
      y.path ?? '',
      y.code,
      y.entity?.kind ?? '',
      y.entity?.id ?? '',
    ];
    for (let i = 0; i < left.length; i += 1) {
      const order = (left[i] ?? '').localeCompare(right[i] ?? '');
      if (order !== 0) return order;
    }
    return 0;
  });
export function validateMathDocument(input: unknown): ValidationResult {
  if (!structural(input))
    return { valid: false, diagnostics: sort((structural.errors ?? []).map(sd)) };
  const parsed = mathDocumentSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      diagnostics: sort(
        parsed.error.issues.map((i) => ({
          code: 'SCHEMA_INVALID',
          severity: 'error',
          path: `/${i.path.join('/')}`,
          message: i.message,
        })),
      ),
    };
  const doc = parsed.data;
  const out: Diagnostic[] = [];
  if (doc.mathirVersion !== MATHIR_VERSION)
    out.push(
      d(
        'UNSUPPORTED_VERSION',
        '/mathirVersion',
        `Unsupported MathIR version ${doc.mathirVersion}; expected ${MATHIR_VERSION}`,
        'document',
        doc.documentId,
      ),
    );
  const groups: [string, { id: string }[], EntityKind][] = [
    ['sources', doc.sources ?? [], 'source'],
    ['declarations', doc.declarations, 'declaration'],
    ['expressions', doc.expressions, 'expression'],
    ['statements', doc.statements, 'statement'],
    ['steps', doc.steps, 'step'],
    ['annotations', doc.annotations ?? [], 'annotation'],
  ];
  for (const [name, items, kind] of groups) {
    const seen = new Set<string>();
    items.forEach((x, i) => {
      if (seen.has(x.id))
        out.push(d('DUPLICATE_ID', `/${name}/${i}/id`, `Duplicate ${kind} ID ${x.id}`, kind, x.id));
      seen.add(x.id);
    });
  }
  const sources = new Map((doc.sources ?? []).map((x) => [x.id, x]));
  const declarations = new Map(doc.declarations.map((x) => [x.id, x]));
  const expressions = new Set(doc.expressions.map((x) => x.id));
  const statements = new Set(doc.statements.map((x) => x.id));
  const steps = new Map(doc.steps.map((x, i) => [x.id, i]));
  const span = (s: SourceSpan | undefined, path: string, kind: EntityKind, id: string) => {
    if (!s) return;
    const src = sources.get(s.sourceId);
    if (!src)
      out.push(
        d('UNKNOWN_SOURCE_REFERENCE', `${path}/sourceId`, `Unknown source ${s.sourceId}`, kind, id),
      );
    else if (s.start > s.end || (src.content !== undefined && s.end > src.content.length))
      out.push(
        d(
          'INVALID_SOURCE_SPAN',
          path,
          `Invalid UTF-16 source span [${s.start}, ${s.end})`,
          kind,
          id,
        ),
      );
  };
  const er = (id: string, path: string, ownerKind: EntityKind, owner: string) => {
    if (!expressions.has(id))
      out.push(
        d('UNKNOWN_EXPRESSION_REFERENCE', path, `Unknown expression ${id}`, ownerKind, owner),
      );
  };
  doc.declarations.forEach((x, i) => {
    span(x.sourceSpan, `/declarations/${i}/sourceSpan`, 'declaration', x.id);
    if (x.kind === 'function')
      x.parameters.forEach((id, j) => {
        if (!declarations.has(id))
          out.push(
            d(
              'UNKNOWN_DECLARATION_REFERENCE',
              `/declarations/${i}/parameters/${j}`,
              `Unknown parameter declaration ${id}`,
              'declaration',
              x.id,
            ),
          );
      });
  });
  doc.expressions.forEach((x, i) => {
    const b = `/expressions/${i}`;
    span(x.sourceSpan, `${b}/sourceSpan`, 'expression', x.id);
    if (x.kind === 'symbol' && !declarations.has(x.declarationId))
      out.push(
        d(
          'UNKNOWN_DECLARATION_REFERENCE',
          `${b}/declarationId`,
          `Unknown declaration ${x.declarationId}`,
          'expression',
          x.id,
        ),
      );
    if (x.kind === 'unary') er(x.operand, `${b}/operand`, 'expression', x.id);
    if (x.kind === 'binary') {
      er(x.left, `${b}/left`, 'expression', x.id);
      er(x.right, `${b}/right`, 'expression', x.id);
    }
    if (x.kind === 'nary') {
      x.operands.forEach((id, j) => er(id, `${b}/operands/${j}`, 'expression', x.id));
      if (x.operands.length < 2)
        out.push(
          d(
            'INVALID_OPERATOR_ARITY',
            `${b}/operands`,
            `${x.operator} requires at least two operands`,
            'expression',
            x.id,
          ),
        );
    }
    if (x.kind === 'function_call') {
      x.arguments.forEach((id, j) => er(id, `${b}/arguments/${j}`, 'expression', x.id));
      const fn = declarations.get(x.functionDeclarationId);
      if (!fn || fn.kind !== 'function')
        out.push(
          d(
            'UNKNOWN_DECLARATION_REFERENCE',
            `${b}/functionDeclarationId`,
            `Unknown function declaration ${x.functionDeclarationId}`,
            'expression',
            x.id,
          ),
        );
      else if (fn.parameters.length !== x.arguments.length)
        out.push(
          d(
            'INVALID_FUNCTION_ARITY',
            `${b}/arguments`,
            `Function ${fn.id} expects ${fn.parameters.length} arguments, received ${x.arguments.length}`,
            'expression',
            x.id,
          ),
        );
    }
    if (x.kind === 'piecewise') {
      x.branches.forEach((q, j) => {
        er(q.condition, `${b}/branches/${j}/condition`, 'expression', x.id);
        er(q.value, `${b}/branches/${j}/value`, 'expression', x.id);
      });
      if (x.otherwise) er(x.otherwise, `${b}/otherwise`, 'expression', x.id);
    }
    if (x.kind === 'unparsed')
      x.candidates?.forEach((id, j) => er(id, `${b}/candidates/${j}`, 'expression', x.id));
  });
  doc.statements.forEach((x, i) => {
    const b = `/statements/${i}`;
    span(x.sourceSpan, `${b}/sourceSpan`, 'statement', x.id);
    if (x.kind === 'relation') {
      er(x.left, `${b}/left`, 'statement', x.id);
      er(x.right, `${b}/right`, 'statement', x.id);
    }
    if (x.kind === 'predicate')
      x.arguments.forEach((id, j) => er(id, `${b}/arguments/${j}`, 'statement', x.id));
    if (x.kind === 'compound') {
      x.operands.forEach((id, j) => {
        if (!statements.has(id))
          out.push(
            d(
              'UNKNOWN_STATEMENT_REFERENCE',
              `${b}/operands/${j}`,
              `Unknown statement ${id}`,
              'statement',
              x.id,
            ),
          );
      });
      const n = x.connective === 'not' ? 1 : 2;
      if (x.operands.length !== n)
        out.push(
          d(
            'INVALID_COMPOUND_ARITY',
            `${b}/operands`,
            `${x.connective} requires ${n} operand(s)`,
            'statement',
            x.id,
          ),
        );
    }
  });
  doc.assumptions.forEach((id, i) => {
    if (!statements.has(id))
      out.push(
        d(
          'INVALID_ASSUMPTION_REFERENCE',
          `/assumptions/${i}`,
          `Unknown assumption statement ${id}`,
          'document',
          doc.documentId,
        ),
      );
  });
  doc.goals.forEach((id, i) => {
    if (!statements.has(id))
      out.push(
        d(
          'INVALID_GOAL_REFERENCE',
          `/goals/${i}`,
          `Unknown goal statement ${id}`,
          'document',
          doc.documentId,
        ),
      );
  });
  doc.steps.forEach((x, i) => {
    const b = `/steps/${i}`;
    span(x.sourceSpan, `${b}/sourceSpan`, 'step', x.id);
    [...x.premises, x.conclusion, ...x.sideConditions].forEach((id, j) => {
      if (!statements.has(id))
        out.push(
          d(
            'UNKNOWN_STATEMENT_REFERENCE',
            `${b}/statementReferences/${j}`,
            `Unknown statement ${id}`,
            'step',
            x.id,
          ),
        );
    });
    x.dependencies.forEach((id, j) => {
      const n = steps.get(id);
      if (n === undefined)
        out.push(
          d('UNKNOWN_STEP_REFERENCE', `${b}/dependencies/${j}`, `Unknown step ${id}`, 'step', x.id),
        );
      else if (n >= i)
        out.push(
          d(
            'FORWARD_STEP_DEPENDENCY',
            `${b}/dependencies/${j}`,
            `Dependency ${id} is not earlier than ${x.id}`,
            'step',
            x.id,
          ),
        );
    });
    if (x.confidence !== undefined && (x.confidence < 0 || x.confidence > 1))
      out.push(
        d(
          'INVALID_CONFIDENCE',
          `${b}/confidence`,
          'Confidence must be between 0 and 1',
          'step',
          x.id,
        ),
      );
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const x = doc.steps[steps.get(id) ?? -1];
    const cycle = x?.dependencies.some((dep) => steps.has(dep) && visit(dep)) ?? false;
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  doc.steps.forEach((x, i) => {
    if (visit(x.id))
      out.push(
        d(
          'CYCLIC_STEP_DEPENDENCY',
          `/steps/${i}/dependencies`,
          `Step ${x.id} participates in a dependency cycle`,
          'step',
          x.id,
        ),
      );
  });
  doc.annotations?.forEach((x, i) => {
    const targets: { expression: Set<string>; statement: Set<string>; step: Set<string> } = {
      expression: expressions,
      statement: statements,
      step: new Set(steps.keys()),
    };
    if (!targets[x.target.kind].has(x.target.id))
      out.push(
        d(
          'INVALID_ANNOTATION_TARGET',
          `/annotations/${i}/target`,
          `Unknown ${x.target.kind} target ${x.target.id}`,
          'annotation',
          x.id,
        ),
      );
    span(x.sourceSpan, `/annotations/${i}/sourceSpan`, 'annotation', x.id);
  });
  const diagnostics = sort(out);
  return diagnostics.length
    ? { valid: false, diagnostics }
    : { valid: true, document: doc, diagnostics };
}

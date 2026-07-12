import { readFile } from 'node:fs/promises';
import { type Diagnostic, type ValidationResult, validateMathDocument } from '@mathir/validator';
export interface CliResult {
  exitCode: 0 | 1;
  output: string;
}
function formatResult(documentId: string, result: ValidationResult, format: string): CliResult {
  if (format === 'json')
    return {
      exitCode: result.valid ? 0 : 1,
      output: JSON.stringify(
        { valid: result.valid, documentId, diagnostics: result.diagnostics },
        null,
        2,
      ),
    };
  return {
    exitCode: result.valid ? 0 : 1,
    output: [
      `${result.valid ? 'VALID' : 'INVALID'} ${documentId}`,
      ...result.diagnostics.map((d) => `ERROR ${d.code} ${d.path ?? '/'} ${d.message}`),
    ].join('\n'),
  };
}
export async function runCli(args: string[]): Promise<CliResult> {
  const [command, file, ...options] = args;
  const fi = options.indexOf('--format');
  const format = fi >= 0 ? options[fi + 1] : 'text';
  if (command !== 'validate' || !file || (format !== 'text' && format !== 'json'))
    return { exitCode: 1, output: 'Usage: mathir validate <file> [--format text|json]' };
  let input: unknown;
  try {
    input = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    const d: Diagnostic = {
      code: 'INVALID_JSON',
      severity: 'error',
      path: '/',
      message: error instanceof Error ? error.message : 'Invalid JSON',
    };
    return formatResult('unknown', { valid: false, diagnostics: [d] }, format);
  }
  const id =
    typeof input === 'object' &&
    input !== null &&
    'documentId' in input &&
    typeof input.documentId === 'string'
      ? input.documentId
      : 'unknown';
  return formatResult(id, validateMathDocument(input), format);
}

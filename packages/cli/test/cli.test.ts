import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatResult, runCli } from '../src/index.js';

const valid = new URL('../../../test-vectors/valid/minimal-problem.json', import.meta.url).pathname;
const invalid = new URL('../../../test-vectors/invalid/unsupported-version.json', import.meta.url)
  .pathname;

describe('mathir validate', () => {
  it('prints stable text and exits zero for valid input', async () =>
    expect(await runCli(['validate', valid])).toEqual({ exitCode: 0, output: 'VALID minimal' }));
  it('prints diagnostics and exits one for invalid input', async () => {
    const result = await runCli(['validate', invalid]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('INVALID bad-version');
    expect(result.output).toContain('ERROR UNSUPPORTED_VERSION');
  });
  it('emits machine-readable JSON', async () => {
    const result = await runCli(['validate', valid, '--format', 'json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      valid: true,
      documentId: 'minimal',
      diagnostics: [],
    });
  });
  it('handles malformed JSON', async () => {
    const path = join(tmpdir(), `mathir-malformed-${process.pid}.json`);
    await writeFile(path, '{');
    const result = await runCli(['validate', path]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('ERROR INVALID_JSON');
  });
  it('renders warning severity without inventing validator warnings', () => {
    const result = formatResult(
      'synthetic',
      {
        valid: true,
        diagnostics: [{ code: 'SYNTHETIC_WARNING', severity: 'warning', message: 'test warning' }],
      },
      'text',
    );
    expect(result.output).toBe('VALID synthetic\nWARNING SYNTHETIC_WARNING / test warning');
  });
});

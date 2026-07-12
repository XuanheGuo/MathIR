import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatResult, runCli } from '../src/index.js';

const valid = new URL('../../../test-vectors/valid/minimal-problem.json', import.meta.url).pathname;
const invalid = new URL('../../../test-vectors/invalid/unsupported-version.json', import.meta.url)
  .pathname;
const algebra = new URL('../../../test-vectors/valid/algebra-solution.json', import.meta.url)
  .pathname;
const sourceBin = new URL('../src/bin.ts', import.meta.url).pathname;
const distBin = new URL('../dist/bin.js', import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

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
  it('registers the package executable and preserves its shebang through build', () => {
    expect(packageJson.bin).toEqual({ mathir: './dist/bin.js' });
    expect(readFileSync(sourceBin, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
    expect(existsSync(distBin)).toBe(true);
    expect(readFileSync(distBin, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
  });
  it('executes the built CLI as a child process with correct exits and JSON', () => {
    const accepted = spawnSync(process.execPath, [distBin, 'validate', valid], {
      encoding: 'utf8',
    });
    expect(accepted.status).toBe(0);
    expect(accepted.stdout.trim()).toBe('VALID minimal');

    const rejected = spawnSync(process.execPath, [distBin, 'validate', invalid], {
      encoding: 'utf8',
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toContain('ERROR UNSUPPORTED_VERSION');

    const json = spawnSync(process.execPath, [distBin, 'validate', algebra, '--format', 'json'], {
      encoding: 'utf8',
    });
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ valid: true, documentId: 'algebra-x' });
  });
});

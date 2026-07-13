import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CAPABILITY_ID, CAPABILITY_VERSION, MATHERIUM_PROTOCOL_VERSION } from '../src/constants.js';

const distMain = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const HOST = '127.0.0.1';
const PORT = 4111;
const BASE_URL = `http://${HOST}:${PORT}`;

function minimalDocument(documentId: string) {
  return {
    mathirVersion: '0.1.0',
    documentId,
    kind: 'problem',
    declarations: [],
    expressions: [],
    statements: [],
    steps: [],
    assumptions: [],
    goals: [],
  };
}

function executeBody(traceId: string, document: unknown) {
  return {
    protocolVersion: MATHERIUM_PROTOCOL_VERSION,
    invocationId: randomUUID(),
    capabilityId: CAPABILITY_ID,
    capabilityVersion: CAPABILITY_VERSION,
    traceId,
    input: { document },
  };
}
const algebraDocument = {
  ...minimalDocument('process-algebra'),
  declarations: [{ id: 'x', kind: 'symbol', name: 'x' }],
  expressions: [
    { id: 'sx', kind: 'symbol', declarationId: 'x' },
    { id: 'one', kind: 'number', value: '1' },
    { id: 'two', kind: 'number', value: '2' },
    { id: 'sum', kind: 'nary', operator: 'add', operands: ['sx', 'one'] },
    { id: 'square', kind: 'binary', operator: 'power', left: 'sum', right: 'two' },
    { id: 'x2', kind: 'binary', operator: 'power', left: 'sx', right: 'two' },
    { id: 'twox', kind: 'nary', operator: 'multiply', operands: ['two', 'sx'] },
    { id: 'expanded', kind: 'nary', operator: 'add', operands: ['x2', 'twox', 'one'] },
  ],
};
function algebraExecuteBody(capabilityId: string, input: unknown) {
  return {
    protocolVersion: MATHERIUM_PROTOCOL_VERSION,
    invocationId: randomUUID(),
    capabilityId,
    capabilityVersion: '0.1.0',
    traceId: 'process-algebra',
    input,
  };
}

async function waitForHealth(timeoutMs: number, output: string[]): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `provider did not become healthy in time: ${String(lastError)}\n${output.join('')}`,
  );
}

describe('provider real process', () => {
  let child: ChildProcess;
  const output: string[] = [];

  beforeAll(async () => {
    if (!existsSync(distMain)) {
      throw new Error(
        `missing build output at ${distMain}; run "pnpm --filter @mathir/provider build" first`,
      );
    }
    child = spawn(process.execPath, [distMain], {
      env: {
        ...process.env,
        MATHIR_PROVIDER_HOST: HOST,
        MATHIR_PROVIDER_PORT: String(PORT),
        MATHIR_PROVIDER_PUBLIC_URL: BASE_URL,
        LOG_LEVEL: 'warn',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
    await waitForHealth(10000, output);
  });

  afterAll(async () => {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  });

  it('serves health over a real HTTP connection', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      serviceId: 'mathir-validator',
      version: '0.3.0',
    });
  });

  it('serves the manifest with the configured public URL', async () => {
    const response = await fetch(`${BASE_URL}/.well-known/matherium/service.json`);
    expect(response.status).toBe(200);
    const manifest = await response.json();
    expect(manifest.protocolVersion).toBe('0.2.0');
    expect(manifest.baseUrl).toBe(BASE_URL);
    expect(
      manifest.capabilities.some(
        (capability: { capabilityId: string }) => capability.capabilityId === CAPABILITY_ID,
      ),
    ).toBe(true);
  });

  it('executes a valid MathIR document over a real HTTP connection', async () => {
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(executeBody('process-test-valid', minimalDocument('minimal'))),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output.valid).toBe(true);
    expect(body.output.diagnostics).toEqual([]);
  });

  it('executes an invalid MathIR document as a successful invocation, not an HTTP failure', async () => {
    const document = {
      ...minimalDocument('bad-expression-ref'),
      expressions: [{ id: 'neg', kind: 'unary', operator: 'negate', operand: 'missing' }],
    };
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(executeBody('process-test-invalid', document)),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output.valid).toBe(false);
    expect(
      body.output.diagnostics.some(
        (d: { code: string }) => d.code === 'UNKNOWN_EXPRESSION_REFERENCE',
      ),
    ).toBe(true);
  });

  it('executes polynomial normalization over a real child-process connection', async () => {
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        algebraExecuteBody('mathir.normalize-polynomial', {
          document: algebraDocument,
          expressionId: 'square',
        }),
      ),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output.outcome).toBe('normalized');
  });

  it('executes polynomial equivalence over a real child-process connection', async () => {
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        algebraExecuteBody('mathir.check-polynomial-equivalence', {
          document: algebraDocument,
          leftExpressionId: 'square',
          rightExpressionId: 'expanded',
        }),
      ),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output.outcome).toBe('equivalent');
  });

  it('executes rational normalization over a real child-process connection', async () => {
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        algebraExecuteBody('mathir.normalize-rational-function', {
          document: algebraDocument,
          expressionId: 'quotient',
          assumptionMode: 'ignore',
        }),
      ),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output).toMatchObject({ outcome: 'normalized', domainStatus: 'required' });
  });

  it('executes rational equivalence over a real child-process connection', async () => {
    const response = await fetch(`${BASE_URL}/v0/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        algebraExecuteBody('mathir.check-rational-function-equivalence', {
          document: algebraDocument,
          leftExpressionId: 'quotient',
          rightExpressionId: 'one',
          assumptionMode: 'ignore',
        }),
      ),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('succeeded');
    expect(body.output).toMatchObject({
      outcome: 'conditionally_equivalent',
      conditionStatus: 'required',
    });
  });

  it('shuts down cleanly on SIGTERM and releases the port', async () => {
    const exitPromise = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });
    child.kill('SIGTERM');
    const code = await exitPromise;
    expect(code).toBe(0);
    await expect(fetch(`${BASE_URL}/health`)).rejects.toThrow();
  });
});

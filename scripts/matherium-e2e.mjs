#!/usr/bin/env node
/**
 * Orchestrates the two external Matherium integration checks for Phase 1B:
 *
 *   --mode=conformance   Runs the real Matherium Conformance Suite CLI
 *                         against a live apps/provider process.
 *   --mode=hub            Boots a real Matherium Hub against a real
 *                         PostgreSQL database, registers the MathIR
 *                         provider, invokes it, and asserts on the
 *                         resulting Invocation/Artifact records.
 *
 * All HTTP calls and assertions are plain Node (fetch + node:assert), not
 * shell/grep, so failures produce a real stack trace and diff instead of a
 * silently-wrong grep match. Every process this script starts is stopped in
 * a `finally` block (and on SIGINT/SIGTERM), whether the run succeeds or
 * throws.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MATHERIUM_DIR = path.join(REPO_ROOT, '.external', 'matherium');
const PROVIDER_MAIN = path.join(REPO_ROOT, 'apps', 'provider', 'dist', 'main.js');
const PROVIDER_CAPABILITY_MODULE = path.join(
  REPO_ROOT,
  'apps',
  'provider',
  'dist',
  'capability.js',
);
const PROVIDER_REGISTRY_MODULE = path.join(
  REPO_ROOT,
  'apps',
  'provider',
  'dist',
  'capabilities',
  'registry.js',
);

const MODE = parseMode(process.argv);

const PROVIDER_HOST = process.env.MATHIR_PROVIDER_HOST ?? '127.0.0.1';
const PROVIDER_PORT = process.env.MATHIR_PROVIDER_PORT ?? '4110';
const PROVIDER_BASE_URL = `http://${PROVIDER_HOST}:${PROVIDER_PORT}`;

const HUB_HOST = process.env.HUB_HOST ?? '127.0.0.1';
const HUB_PORT = process.env.HUB_PORT ?? '4000';
const HUB_BASE_URL = `http://${HUB_HOST}:${HUB_PORT}`;
const MATHERIUM_ADMIN_TOKEN = process.env.MATHERIUM_ADMIN_TOKEN ?? 'test-admin-token';

const VALID_DOCUMENT = {
  mathirVersion: '0.1.0',
  documentId: 'minimal',
  kind: 'problem',
  declarations: [],
  expressions: [],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};

const INVALID_DOCUMENT = {
  mathirVersion: '0.1.0',
  documentId: 'bad-expression-ref',
  kind: 'problem',
  declarations: [],
  expressions: [{ id: 'neg', kind: 'unary', operator: 'negate', operand: 'missing' }],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};
const POLYNOMIAL_DOCUMENT = {
  mathirVersion: '0.1.0',
  documentId: 'phase-2a-e2e',
  kind: 'problem',
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
    { id: 'quotient', kind: 'binary', operator: 'divide', left: 'sx', right: 'sx' },
  ],
  statements: [],
  steps: [],
  assumptions: [],
  goals: [],
};
const RATIONAL_DOCUMENT = {
  mathirVersion: '0.1.0',
  documentId: 'phase-2b-e2e',
  kind: 'problem',
  declarations: [
    { id: 'x', kind: 'symbol', name: 'x' },
    { id: 'y', kind: 'symbol', name: 'y' },
  ],
  expressions: [
    { id: 'x', kind: 'symbol', declarationId: 'x' },
    { id: 'y', kind: 'symbol', declarationId: 'y' },
    { id: 'zero', kind: 'number', value: '0' },
    { id: 'one', kind: 'number', value: '1' },
    { id: 'two', kind: 'number', value: '2' },
    { id: 'x2', kind: 'binary', operator: 'power', left: 'x', right: 'two' },
    { id: 'numerator', kind: 'binary', operator: 'subtract', left: 'x2', right: 'one' },
    { id: 'guard', kind: 'binary', operator: 'subtract', left: 'x', right: 'one' },
    { id: 'fraction', kind: 'binary', operator: 'divide', left: 'numerator', right: 'guard' },
    { id: 'sum', kind: 'nary', operator: 'add', operands: ['x', 'one'] },
    { id: 'inverse', kind: 'binary', operator: 'divide', left: 'one', right: 'x' },
    { id: 'x-plus-one', kind: 'nary', operator: 'add', operands: ['x', 'one'] },
    { id: 'other-inverse', kind: 'binary', operator: 'divide', left: 'one', right: 'x-plus-one' },
    { id: 'multivariate', kind: 'binary', operator: 'divide', left: 'x', right: 'y' },
  ],
  statements: [
    { id: 'nonzero-guard', kind: 'predicate', predicate: 'nonzero', arguments: ['guard'] },
  ],
  steps: [],
  assumptions: ['nonzero-guard'],
  goals: [],
};
const CAPABILITIES = [
  'mathir.check-polynomial-equivalence',
  'mathir.check-rational-function-equivalence',
  'mathir.normalize-polynomial',
  'mathir.normalize-rational-function',
  'mathir.validate-document',
  'mathir.verify-algebraic-step',
];

const stepDocument = (base, statements, target, assumptions = []) => ({
  ...base,
  documentId: `phase-2c-${target.id}`,
  statements,
  steps: [target],
  assumptions,
});
const algebraicStep = (conclusion, premises = [], overrides = {}) => ({
  id: 'verify-step',
  premises,
  conclusion,
  dependencies: [],
  rule: { kind: 'equivalence', name: 'simplification' },
  sideConditions: [],
  ...overrides,
});

function parseMode(argv) {
  const flag = argv.find((a) => a.startsWith('--mode='));
  const value = flag ? flag.slice('--mode='.length) : undefined;
  if (value !== 'conformance' && value !== 'hub') {
    console.error('usage: matherium-e2e.mjs --mode=conformance|hub');
    process.exit(2);
  }
  return value;
}

function log(section, message) {
  console.log(`[${section}] ${message}`);
}

function requireBuilt(file, hint) {
  if (!existsSync(file)) {
    throw new Error(`missing build output at ${file}; run "${hint}" first`);
  }
}

async function requestJson(method, url, { headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(
      `${method} ${url} returned a non-JSON body (status ${response.status}): ${text.slice(0, 500)}`,
    );
  }
  return { status: response.status, body: parsed };
}

class ManagedProcess {
  constructor(name, command, args, options = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.options = options;
    this.child = null;
    this.chunks = [];
    this.expectedExit = false;
  }

  start() {
    this.child = spawn(this.command, this.args, {
      ...this.options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (chunk) => this.chunks.push(chunk));
    this.child.stderr.on('data', (chunk) => this.chunks.push(chunk));
    log(this.name, `started (pid ${this.child.pid})`);
  }

  tail() {
    return Buffer.concat(this.chunks).toString('utf8').slice(-4000);
  }

  async waitForHealth(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null) {
        throw new Error(
          `[${this.name}] process exited before becoming healthy (code=${this.child.exitCode})\n${this.tail()}`,
        );
      }
      try {
        const response = await fetch(url);
        if (response.ok) {
          log(this.name, `healthy at ${url}`);
          return;
        }
      } catch (err) {
        lastError = err;
      }
      await delay(150);
    }
    throw new Error(
      `[${this.name}] did not become healthy within ${timeoutMs}ms: ${String(lastError)}\n${this.tail()}`,
    );
  }

  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    this.expectedExit = true;
    log(this.name, 'stopping');
    this.child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise((resolve) => this.child.once('exit', () => resolve(true))),
      delay(10000).then(() => false),
    ]);
    if (!exited) {
      log(this.name, 'did not exit after SIGTERM, sending SIGKILL');
      this.child.kill('SIGKILL');
    }
  }
}

const started = [];

async function stopAll() {
  for (const proc of started.slice().reverse()) {
    await proc.stop();
  }
}

let shuttingDownFromSignal = false;
async function onSignal(signal) {
  if (shuttingDownFromSignal) return;
  shuttingDownFromSignal = true;
  console.error(`received ${signal}, stopping managed processes`);
  await stopAll();
  process.exit(signal === 'SIGINT' ? 130 : 143);
}
process.on('SIGINT', () => void onSignal('SIGINT'));
process.on('SIGTERM', () => void onSignal('SIGTERM'));

async function startProvider() {
  requireBuilt(PROVIDER_MAIN, 'pnpm --filter @mathir/provider build');
  const provider = new ManagedProcess('provider', process.execPath, [PROVIDER_MAIN], {
    env: {
      ...process.env,
      MATHIR_PROVIDER_HOST: PROVIDER_HOST,
      MATHIR_PROVIDER_PORT: PROVIDER_PORT,
      MATHIR_PROVIDER_PUBLIC_URL: PROVIDER_BASE_URL,
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    },
  });
  provider.start();
  started.push(provider);
  await provider.waitForHealth(`${PROVIDER_BASE_URL}/health`, 15000);
  return provider;
}

async function runConformance() {
  if (!existsSync(MATHERIUM_DIR)) {
    throw new Error(`missing external Matherium checkout at ${MATHERIUM_DIR}`);
  }
  log('conformance', `running the Matherium Conformance Suite against ${PROVIDER_BASE_URL}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['--filter', '@matherium/conformance', 'run', 'run', PROVIDER_BASE_URL],
      { cwd: MATHERIUM_DIR, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
  if (exitCode !== 0) {
    throw new Error(`Matherium conformance suite exited with code ${exitCode}`);
  }
  log('conformance', 'all checks passed');
}

async function startHub() {
  if (!existsSync(MATHERIUM_DIR)) {
    throw new Error(`missing external Matherium checkout at ${MATHERIUM_DIR}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to a reachable PostgreSQL instance for --mode=hub');
  }
  const hub = new ManagedProcess('hub', 'pnpm', ['--filter', '@matherium/hub-api', 'start'], {
    cwd: MATHERIUM_DIR,
    env: {
      ...process.env,
      HUB_HOST,
      HUB_PORT,
      MATHERIUM_ADMIN_TOKEN,
      MATHERIUM_BOOTSTRAP_SERVICES: process.env.MATHERIUM_BOOTSTRAP_SERVICES ?? '',
      ALLOW_PRIVATE_PROVIDER_URLS: process.env.ALLOW_PRIVATE_PROVIDER_URLS ?? 'true',
      MAX_PROVIDER_TIMEOUT_MS: process.env.MAX_PROVIDER_TIMEOUT_MS ?? '30000',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    },
  });
  hub.start();
  started.push(hub);
  await hub.waitForHealth(`${HUB_BASE_URL}/health/ready`, 20000);
  return hub;
}

async function registerProvider() {
  log('hub-e2e', `registering provider ${PROVIDER_BASE_URL}`);
  const response = await requestJson('POST', `${HUB_BASE_URL}/v0/admin/services`, {
    headers: { authorization: `Bearer ${MATHERIUM_ADMIN_TOKEN}` },
    body: { baseUrl: PROVIDER_BASE_URL },
  });
  assert.equal(
    response.status,
    201,
    `service registration failed: ${JSON.stringify(response.body)}`,
  );
  const service = response.body.service;
  assert.equal(service.serviceId, 'mathir-validator');
  assert.equal(service.protocolVersion, '0.2.0');
  assert.equal(service.version, '0.4.0');
  for (const capabilityId of CAPABILITIES) {
    const offering = service.capabilities.find(
      (c) => c.capabilityId === capabilityId && c.version === '0.1.0',
    );
    assert.ok(offering, `registered service did not offer ${capabilityId}@0.1.0`);
    assert.equal(offering.lifecycleStatus, 'active');
  }
  log('hub-e2e', 'service registered with all six Phase 2C capabilities active');
  return service;
}

async function assertCapabilityCatalog() {
  const response = await requestJson('GET', `${HUB_BASE_URL}/v0/capabilities`);
  assert.equal(response.status, 200);
  for (const capabilityId of CAPABILITIES) {
    const entry = response.body.capabilities.find(
      (c) => c.capabilityId === capabilityId && c.capabilityVersion === '0.1.0',
    );
    assert.ok(entry, `capability catalog is missing ${capabilityId}@0.1.0`);
    assert.ok(entry.offerings.find((o) => o.serviceId === 'mathir-validator'));
  }
  log('hub-e2e', 'capability catalog contains all six offerings from mathir-validator');
}

async function invoke(capabilityId, input, traceLabel) {
  const response = await requestJson('POST', `${HUB_BASE_URL}/v0/invocations`, {
    body: {
      capabilityId,
      capabilityVersion: '0.1.0',
      serviceId: 'mathir-validator',
      input,
    },
  });
  assert.ok(
    response.status === 200 || response.status === 201,
    `invocation (${traceLabel}) failed: ${JSON.stringify(response.body)}`,
  );
  const { invocation, outputArtifacts, replayed } = response.body;
  assert.equal(replayed, false, `invocation (${traceLabel}) unexpectedly replayed`);
  assert.equal(
    invocation.status,
    'succeeded',
    `invocation (${traceLabel}) did not succeed: ${JSON.stringify(invocation)}`,
  );
  assert.equal(invocation.capabilityId, capabilityId);
  assert.equal(invocation.capabilityVersion, '0.1.0');
  assert.equal(invocation.serviceId, 'mathir-validator');
  assert.equal(
    outputArtifacts.length,
    1,
    `invocation (${traceLabel}) did not produce exactly one output artifact`,
  );
  log('hub-e2e', `invocation (${traceLabel}) succeeded: ${invocation.invocationId}`);
  return invocation;
}

async function fetchAndAssertArtifact(invocation, expectedContent, traceLabel) {
  const artifactId = invocation.outputArtifactIds[0];
  assert.ok(artifactId, `invocation (${traceLabel}) has no outputArtifactIds`);
  const response = await requestJson('GET', `${HUB_BASE_URL}/v0/artifacts/${artifactId}`);
  assert.equal(
    response.status,
    200,
    `artifact fetch (${traceLabel}) failed: ${JSON.stringify(response.body)}`,
  );
  const artifact = response.body.artifact;
  assert.equal(artifact.invocationId, invocation.invocationId);
  assert.equal(artifact.kind, 'capability.output');
  assert.equal(artifact.mediaType, 'application/json');
  assert.equal(artifact.schemaVersion, '0.1.0');
  assert.equal(artifact.producer.serviceId, 'mathir-validator');
  assert.equal(artifact.producer.capabilityId, invocation.capabilityId);
  assert.equal(artifact.producer.capabilityVersion, '0.1.0');
  assert.deepEqual(
    artifact.content,
    expectedContent,
    `artifact content (${traceLabel}) did not match`,
  );

  const { PROVIDER_CAPABILITIES } = await import(`file://${PROVIDER_REGISTRY_MODULE}`);
  const capability = PROVIDER_CAPABILITIES.find(
    (c) =>
      c.capabilityId === invocation.capabilityId &&
      c.capabilityVersion === invocation.capabilityVersion,
  );
  assert.ok(capability, `missing provider registry entry for ${invocation.capabilityId}`);
  const Ajv2020 = (await import('ajv/dist/2020.js')).default;
  assert.ok(
    new Ajv2020({ strict: true }).compile(capability.outputSchema)(artifact.content),
    `artifact content (${traceLabel}) does not satisfy output schema`,
  );
  log('hub-e2e', `artifact (${traceLabel}) content and provenance verified`);
  return artifact;
}

async function assertEvents(invocation, traceLabel) {
  const response = await requestJson(
    'GET',
    `${HUB_BASE_URL}/v0/invocations/${invocation.invocationId}/events`,
  );
  assert.equal(response.status, 200);
  const types = response.body.events.map((e) => e.eventType);
  for (const expected of [
    'invocation.created',
    'provider.request_sent',
    'provider.response_received',
    'artifact.created',
  ]) {
    assert.ok(
      types.includes(expected),
      `invocation (${traceLabel}) events missing "${expected}": ${JSON.stringify(types)}`,
    );
  }
  const succeeded = response.body.events.find(
    (e) => e.eventType === 'invocation.status_changed' && e.toStatus === 'succeeded',
  );
  assert.ok(
    succeeded,
    `invocation (${traceLabel}) has no invocation.status_changed -> succeeded event: ${JSON.stringify(types)}`,
  );
  log('hub-e2e', `invocation (${traceLabel}) events verified: ${types.join(', ')}`);
}

async function runHubE2E() {
  await startHub();
  await registerProvider();
  await assertCapabilityCatalog();

  const validInvocation = await invoke(
    'mathir.validate-document',
    { document: VALID_DOCUMENT },
    'valid-document',
  );
  await assertEvents(validInvocation, 'valid-document');
  await fetchAndAssertArtifact(
    validInvocation,
    {
      valid: true,
      documentId: 'minimal',
      declaredMathirVersion: '0.1.0',
      diagnostics: [],
      totalDiagnostics: 0,
      diagnosticsTruncated: false,
    },
    'valid-document',
  );

  const normalizeInput = { document: POLYNOMIAL_DOCUMENT, expressionId: 'square' };
  const normalizeInvocation = await invoke(
    'mathir.normalize-polynomial',
    normalizeInput,
    'normalize',
  );
  await assertEvents(normalizeInvocation, 'normalize');
  const { PROVIDER_CAPABILITIES } = await import(`file://${PROVIDER_REGISTRY_MODULE}`);
  const executeExpected = (id, input) => {
    const capability = PROVIDER_CAPABILITIES.find((c) => c.capabilityId === id);
    assert.ok(capability);
    return capability.execute(input);
  };
  const normalizeOutput = executeExpected('mathir.normalize-polynomial', normalizeInput);
  assert.deepEqual(normalizeOutput.normalForm, {
    kind: 'formal-polynomial',
    coefficientDomain: 'rational',
    terms: [
      { coefficient: { numerator: '1', denominator: '1' }, powers: [] },
      {
        coefficient: { numerator: '2', denominator: '1' },
        powers: [{ declarationId: 'x', exponent: 1 }],
      },
      {
        coefficient: { numerator: '1', denominator: '1' },
        powers: [{ declarationId: 'x', exponent: 2 }],
      },
    ],
  });
  await fetchAndAssertArtifact(normalizeInvocation, normalizeOutput, 'normalize');

  for (const [label, leftExpressionId, rightExpressionId, outcome] of [
    ['equivalent', 'square', 'expanded', 'equivalent'],
    ['not-equivalent', 'sum', 'sx', 'not_equivalent'],
    ['unknown', 'quotient', 'one', 'unknown'],
  ]) {
    const input = { document: POLYNOMIAL_DOCUMENT, leftExpressionId, rightExpressionId };
    const invocation = await invoke('mathir.check-polynomial-equivalence', input, label);
    await assertEvents(invocation, label);
    const output = executeExpected('mathir.check-polynomial-equivalence', input);
    assert.equal(output.outcome, outcome);
    if (label === 'unknown')
      assert.ok(output.issues.some((issue) => issue.code === 'NON_CONSTANT_DIVISOR'));
    await fetchAndAssertArtifact(invocation, output, label);
  }

  const invalidInput = {
    document: INVALID_DOCUMENT,
    leftExpressionId: 'neg',
    rightExpressionId: 'neg',
  };
  const invalidInvocation = await invoke(
    'mathir.check-polynomial-equivalence',
    invalidInput,
    'invalid-document',
  );
  await assertEvents(invalidInvocation, 'invalid-document');
  await fetchAndAssertArtifact(
    invalidInvocation,
    executeExpected('mathir.check-polynomial-equivalence', invalidInput),
    'invalid-document',
  );

  const rationalNormalizeInput = {
    document: RATIONAL_DOCUMENT,
    expressionId: 'fraction',
    assumptionMode: 'ignore',
  };
  const rationalNormalizeInvocation = await invoke(
    'mathir.normalize-rational-function',
    rationalNormalizeInput,
    'rational-normalize',
  );
  await assertEvents(rationalNormalizeInvocation, 'rational-normalize');
  const rationalNormalizeOutput = executeExpected(
    'mathir.normalize-rational-function',
    rationalNormalizeInput,
  );
  assert.equal(rationalNormalizeOutput.outcome, 'normalized');
  assert.equal(rationalNormalizeOutput.domainStatus, 'required');
  assert.deepEqual(
    rationalNormalizeOutput.normalForm.numerator.terms.map((term) => term.coefficient.numerator),
    ['1', '1'],
  );
  assert.deepEqual(
    rationalNormalizeOutput.domainGuard.terms.map((term) => term.coefficient.numerator),
    ['-1', '1'],
  );
  await fetchAndAssertArtifact(
    rationalNormalizeInvocation,
    rationalNormalizeOutput,
    'rational-normalize',
  );

  for (const [label, leftExpressionId, rightExpressionId, assumptionMode, outcome, status] of [
    ['conditional-rational', 'fraction', 'sum', 'ignore', 'conditionally_equivalent', 'required'],
    [
      'assumption-discharged-rational',
      'fraction',
      'sum',
      'document_nonzero',
      'equivalent',
      'satisfied_by_assumptions',
    ],
    ['same-domain-rational', 'inverse', 'inverse', 'ignore', 'equivalent', 'not_required'],
    [
      'not-equivalent-rational',
      'inverse',
      'other-inverse',
      'ignore',
      'not_equivalent',
      'not_applicable',
    ],
    ['unknown-rational', 'multivariate', 'x', 'ignore', 'unknown', 'not_applicable'],
  ]) {
    const input = {
      document: RATIONAL_DOCUMENT,
      leftExpressionId,
      rightExpressionId,
      assumptionMode,
    };
    const invocation = await invoke('mathir.check-rational-function-equivalence', input, label);
    await assertEvents(invocation, label);
    const output = executeExpected('mathir.check-rational-function-equivalence', input);
    assert.equal(output.outcome, outcome);
    assert.equal(output.conditionStatus, status);
    if (label === 'unknown-rational')
      assert.ok(output.issues.some((entry) => entry.code === 'MULTIVARIATE_NOT_SUPPORTED'));
    await fetchAndAssertArtifact(invocation, output, label);
  }

  const invalidRationalInput = {
    document: INVALID_DOCUMENT,
    leftExpressionId: 'neg',
    rightExpressionId: 'neg',
    assumptionMode: 'ignore',
  };
  const invalidRationalInvocation = await invoke(
    'mathir.check-rational-function-equivalence',
    invalidRationalInput,
    'invalid-rational-document',
  );
  await assertEvents(invalidRationalInvocation, 'invalid-rational-document');
  const invalidRationalOutput = executeExpected(
    'mathir.check-rational-function-equivalence',
    invalidRationalInput,
  );
  assert.equal(invalidRationalOutput.outcome, 'invalid_document');
  assert.ok(invalidRationalOutput.validationDiagnostics.length > 0);
  await fetchAndAssertArtifact(
    invalidRationalInvocation,
    invalidRationalOutput,
    'invalid-rational-document',
  );

  const polynomialIdentityDoc = stepDocument(
    POLYNOMIAL_DOCUMENT,
    [{ id: 'result', kind: 'relation', relation: 'equal', left: 'square', right: 'expanded' }],
    algebraicStep('result'),
  );
  const anchoredPolynomialDoc = stepDocument(
    POLYNOMIAL_DOCUMENT,
    [
      { id: 'premise', kind: 'relation', relation: 'equal', left: 'sx', right: 'square' },
      { id: 'result', kind: 'relation', relation: 'equal', left: 'sx', right: 'expanded' },
    ],
    algebraicStep('result', ['premise']),
  );
  const rejectedStepDoc = stepDocument(
    POLYNOMIAL_DOCUMENT,
    [
      { id: 'premise', kind: 'relation', relation: 'equal', left: 'sx', right: 'sum' },
      { id: 'result', kind: 'relation', relation: 'equal', left: 'sx', right: 'expanded' },
    ],
    algebraicStep('result', ['premise']),
  );
  const rationalStatements = [
    { id: 'nonzero-guard', kind: 'predicate', predicate: 'nonzero', arguments: ['guard'] },
    { id: 'premise', kind: 'relation', relation: 'equal', left: 'y', right: 'fraction' },
    { id: 'result', kind: 'relation', relation: 'equal', left: 'y', right: 'sum' },
  ];
  const conditionalStepDoc = stepDocument(
    RATIONAL_DOCUMENT,
    rationalStatements,
    algebraicStep('result', ['premise']),
  );
  const dischargedStepDoc = stepDocument(
    RATIONAL_DOCUMENT,
    rationalStatements,
    algebraicStep('result', ['premise'], { sideConditions: ['nonzero-guard'] }),
  );
  const symmetryDoc = stepDocument(
    RATIONAL_DOCUMENT,
    [
      { id: 'premise', kind: 'relation', relation: 'equal', left: 'x', right: 'y' },
      { id: 'result', kind: 'relation', relation: 'equal', left: 'y', right: 'x' },
    ],
    algebraicStep('result', ['premise']),
  );
  const unsupportedRuleDoc = stepDocument(
    POLYNOMIAL_DOCUMENT,
    [{ id: 'result', kind: 'relation', relation: 'equal', left: 'square', right: 'expanded' }],
    algebraicStep('result', [], { rule: { kind: 'equivalence', name: 'substitution' } }),
  );
  const stepScenarios = [
    [
      'step-polynomial-identity',
      polynomialIdentityDoc,
      'auto',
      'ignore',
      'verified',
      'polynomial',
      'identity_assertion',
    ],
    [
      'step-anchored-polynomial',
      anchoredPolynomialDoc,
      'auto',
      'ignore',
      'verified',
      'polynomial',
      'anchored_rewrite',
    ],
    [
      'step-rejected',
      rejectedStepDoc,
      'auto',
      'ignore',
      'rejected',
      'polynomial',
      'anchored_rewrite',
    ],
    [
      'step-conditional-rational',
      conditionalStepDoc,
      'auto',
      'ignore',
      'conditionally_verified',
      'rational_function',
      'anchored_rewrite',
    ],
    [
      'step-side-condition',
      dischargedStepDoc,
      'auto',
      'step_nonzero',
      'verified',
      'rational_function',
      'anchored_rewrite',
    ],
    ['step-symmetry', symmetryDoc, 'auto', 'ignore', 'verified', 'structural', 'equality_symmetry'],
    ['step-unsupported-rule', unsupportedRuleDoc, 'auto', 'ignore', 'unknown', null, null],
    ['step-invalid-document', INVALID_DOCUMENT, 'auto', 'ignore', 'invalid_document', null, null],
  ];
  for (const [
    label,
    document,
    verificationMode,
    conditionMode,
    outcome,
    engine,
    stepShape,
  ] of stepScenarios) {
    const input = { document, stepId: 'verify-step', verificationMode, conditionMode };
    const invocation = await invoke('mathir.verify-algebraic-step', input, label);
    await assertEvents(invocation, label);
    const output = executeExpected('mathir.verify-algebraic-step', input);
    assert.equal(output.outcome, outcome);
    assert.equal(output.engine, engine);
    assert.equal(output.stepShape, stepShape);
    if (label === 'step-side-condition')
      assert.equal(output.conditionStatus, 'satisfied_by_selected_conditions');
    if (label === 'step-unsupported-rule')
      assert.ok(output.issues.some((entry) => entry.code === 'UNSUPPORTED_STEP_RULE'));
    if (label === 'step-invalid-document') assert.ok(output.validationDiagnostics.length > 0);
    await fetchAndAssertArtifact(invocation, output, label);
  }

  log(
    'hub-e2e',
    'all Phase 2A/2B regressions and Phase 2C step invocations, artifacts, provenance, schemas and events verified',
  );
}

async function main() {
  requireBuilt(PROVIDER_CAPABILITY_MODULE, 'pnpm --filter @mathir/provider build');
  try {
    await startProvider();
    if (MODE === 'conformance') {
      await runConformance();
    } else {
      await runHubE2E();
    }
  } finally {
    await stopAll();
  }
}

main()
  .then(() => {
    console.log(`[${MODE}] OK`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

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
  const offering = service.capabilities.find(
    (c) => c.capabilityId === 'mathir.validate-document' && c.version === '0.1.0',
  );
  assert.ok(
    offering,
    `registered service did not offer mathir.validate-document@0.1.0: ${JSON.stringify(service.capabilities)}`,
  );
  assert.equal(offering.lifecycleStatus, 'active');
  log('hub-e2e', 'service registered with mathir.validate-document@0.1.0 active');
  return service;
}

async function assertCapabilityCatalog() {
  const response = await requestJson('GET', `${HUB_BASE_URL}/v0/capabilities`);
  assert.equal(response.status, 200);
  const entry = response.body.capabilities.find(
    (c) => c.capabilityId === 'mathir.validate-document' && c.capabilityVersion === '0.1.0',
  );
  assert.ok(entry, 'capability catalog is missing mathir.validate-document@0.1.0');
  const offering = entry.offerings.find((o) => o.serviceId === 'mathir-validator');
  assert.ok(offering, 'capability catalog entry is missing the mathir-validator offering');
  log(
    'hub-e2e',
    'capability catalog contains mathir.validate-document@0.1.0 from mathir-validator',
  );
  return entry;
}

async function invoke(document, traceLabel) {
  const response = await requestJson('POST', `${HUB_BASE_URL}/v0/invocations`, {
    body: {
      capabilityId: 'mathir.validate-document',
      capabilityVersion: '0.1.0',
      serviceId: 'mathir-validator',
      input: { document },
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
  assert.equal(invocation.capabilityId, 'mathir.validate-document');
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
  assert.equal(artifact.producer.capabilityId, 'mathir.validate-document');
  assert.equal(artifact.producer.capabilityVersion, '0.1.0');
  assert.deepEqual(
    artifact.content,
    expectedContent,
    `artifact content (${traceLabel}) did not match`,
  );

  const { validateOutputStructure } = await import(`file://${PROVIDER_CAPABILITY_MODULE}`);
  assert.ok(
    validateOutputStructure(artifact.content),
    `artifact content (${traceLabel}) does not satisfy the provider's own output schema`,
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

  const validInvocation = await invoke(VALID_DOCUMENT, 'valid-document');
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

  const invalidInvocation = await invoke(INVALID_DOCUMENT, 'invalid-document');
  await assertEvents(invalidInvocation, 'invalid-document');
  await fetchAndAssertArtifact(
    invalidInvocation,
    {
      valid: false,
      documentId: 'bad-expression-ref',
      declaredMathirVersion: '0.1.0',
      diagnostics: [
        {
          code: 'UNKNOWN_EXPRESSION_REFERENCE',
          severity: 'error',
          message: 'Unknown expression missing',
          path: '/expressions/0/operand',
          entity: { kind: 'expression', id: 'neg' },
        },
      ],
      totalDiagnostics: 1,
      diagnosticsTruncated: false,
    },
    'invalid-document',
  );

  log('hub-e2e', 'valid and invalid document invocations both succeeded as Matherium Invocations');
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

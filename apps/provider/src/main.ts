import { DEFAULT_BODY_LIMIT_BYTES, DEFAULT_HOST, DEFAULT_PORT } from './constants.js';
import { buildServer } from './server.js';

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) return fallback;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid MATHIR_PROVIDER_PORT: ${raw}`);
  }
  return port;
}

function parseBodyLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) return fallback;
  const limit = Number.parseInt(raw, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`invalid BODY_LIMIT_BYTES: ${raw}`);
  }
  return limit;
}

const host = process.env.MATHIR_PROVIDER_HOST ?? DEFAULT_HOST;
const port = parsePort(process.env.MATHIR_PROVIDER_PORT, DEFAULT_PORT);
const publicUrl = process.env.MATHIR_PROVIDER_PUBLIC_URL;
const logLevel = process.env.LOG_LEVEL ?? 'info';
const bodyLimitBytes = parseBodyLimit(process.env.BODY_LIMIT_BYTES, DEFAULT_BODY_LIMIT_BYTES);

const app = buildServer({
  ...(publicUrl !== undefined ? { publicUrl } : {}),
  logLevel,
  bodyLimitBytes,
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

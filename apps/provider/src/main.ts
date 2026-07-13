import { loadProviderConfig } from './config.js';
import { buildServer } from './server.js';

const config = loadProviderConfig(process.env);

const app = buildServer({
  ...(config.publicUrl !== undefined ? { publicUrl: config.publicUrl } : {}),
  logLevel: config.logLevel,
  bodyLimitBytes: config.bodyLimitBytes,
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
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

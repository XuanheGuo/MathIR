import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply } from 'fastify';
import { executeValidateDocument, parseValidateDocumentInput } from './capability.js';
import {
  CAPABILITY_ID,
  CAPABILITY_VERSION,
  DEFAULT_BODY_LIMIT_BYTES,
  EXECUTE_PATH,
  HEALTH_PATH,
  MANIFEST_PATH,
  MATHERIUM_PROTOCOL_VERSION,
  SERVICE_ID,
  SERVICE_VERSION,
} from './constants.js';
import { buildManifest } from './manifest.js';
import {
  type ErrorEnvelope,
  type HealthResponse,
  type ProtocolError,
  buildExecuteFailure,
  buildExecuteSuccess,
  parseExecuteRequest,
  toJsonValue,
} from './protocol.js';

export interface ProviderServerOptions {
  /** Base URL advertised in the manifest; defaults to the bound listen address. */
  publicUrl?: string;
  logLevel?: string;
  bodyLimitBytes?: number;
  /** Disable logging entirely (tests). */
  logger?: boolean;
}

function sendError(reply: FastifyReply, status: number, error: ProtocolError): void {
  const body: ErrorEnvelope = { error };
  reply.code(status).send(body);
}

export function buildServer(options: ProviderServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.logLevel ?? 'info' },
    bodyLimit: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
  });

  const resolveBaseUrl = (): string => {
    if (options.publicUrl !== undefined) return options.publicUrl;
    const address = app.addresses().find((a) => a.family === 'IPv4') ?? app.addresses()[0];
    if (!address) {
      throw new Error('server is not listening and MATHIR_PROVIDER_PUBLIC_URL was not configured');
    }
    return `http://${address.address}:${address.port}`;
  };

  app.get(MANIFEST_PATH, async () => buildManifest(resolveBaseUrl()));

  app.get(
    HEALTH_PATH,
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      serviceId: SERVICE_ID,
      version: SERVICE_VERSION,
    }),
  );

  app.post(EXECUTE_PATH, async (request, reply) => {
    const parsedEnvelope = parseExecuteRequest(request.body);
    if (!parsedEnvelope.ok) {
      sendError(reply, 400, { code: 'INVALID_REQUEST', message: parsedEnvelope.message });
      return;
    }
    const executeRequest = parsedEnvelope.request;

    if (executeRequest.protocolVersion !== MATHERIUM_PROTOCOL_VERSION) {
      sendError(reply, 400, {
        code: 'INVALID_REQUEST',
        message: `unsupported protocol version ${executeRequest.protocolVersion}; this service speaks ${MATHERIUM_PROTOCOL_VERSION}`,
      });
      return;
    }

    if (
      executeRequest.capabilityId !== CAPABILITY_ID ||
      executeRequest.capabilityVersion !== CAPABILITY_VERSION
    ) {
      sendError(reply, 404, {
        code: 'UNKNOWN_CAPABILITY',
        message: `this service does not provide ${executeRequest.capabilityId}@${executeRequest.capabilityVersion}`,
      });
      return;
    }

    const parsedInput = parseValidateDocumentInput(executeRequest.input);
    if (!parsedInput.ok) {
      sendError(reply, 422, { code: 'SCHEMA_VALIDATION_FAILED', message: parsedInput.message });
      return;
    }

    try {
      const output = executeValidateDocument(parsedInput.input);
      reply.send(buildExecuteSuccess(executeRequest.invocationId, toJsonValue(output)));
    } catch (err) {
      request.log.error({ err }, 'unhandled error during mathir.validate-document execution');
      reply.code(200).send(
        buildExecuteFailure(executeRequest.invocationId, {
          code: 'INTERNAL_ERROR',
          message: 'internal error',
          retryable: false,
        }),
      );
    }
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, { code: 'INVALID_REQUEST', message: 'no such route' });
  });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    const status = err.statusCode !== undefined && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err }, 'unhandled error');
      // Never leak internals (stack, file paths) in a 5xx response.
      sendError(reply, 500, { code: 'INTERNAL_ERROR', message: 'internal error' });
      return;
    }
    // Framework-level 4xx: malformed JSON, unsupported media type, body too large.
    sendError(reply, status, { code: 'INVALID_REQUEST', message: err.message });
  });

  return app;
}

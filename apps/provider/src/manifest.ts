import { MATHIR_VERSION } from '@mathir/contracts';
import { PROVIDER_CAPABILITIES } from './capabilities/registry.js';
import {
  CAPABILITY_ID,
  CAPABILITY_VERSION,
  HEALTH_PATH,
  MATHERIUM_PROTOCOL_VERSION,
  SERVICE_ID,
  SERVICE_VERSION,
} from './constants.js';
import type { CapabilityExample, CapabilityManifest, ServiceManifest } from './protocol.js';

export const CAPABILITY_EXAMPLES: CapabilityExample[] =
  PROVIDER_CAPABILITIES.find((c) => c.capabilityId === CAPABILITY_ID)?.examples ?? [];

export function buildValidateDocumentCapabilityManifest(): CapabilityManifest {
  const capability = PROVIDER_CAPABILITIES.find(
    (c) => c.capabilityId === CAPABILITY_ID && c.capabilityVersion === CAPABILITY_VERSION,
  );
  if (!capability) throw new Error('validate capability missing');
  return {
    capabilityId: capability.capabilityId,
    version: capability.capabilityVersion,
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema,
    outputSchema: capability.outputSchema,
    executionMode: 'sync',
    timeoutMs: capability.timeoutMs,
    deterministic: true,
    tags: capability.tags,
    examples: capability.examples,
  };
}

export function buildManifest(baseUrl: string): ServiceManifest {
  return {
    protocolVersion: MATHERIUM_PROTOCOL_VERSION,
    serviceId: SERVICE_ID,
    name: 'MathIR Validator',
    version: SERVICE_VERSION,
    description:
      'Deterministic validation and exact formal polynomial service for MathIR documents.',
    baseUrl,
    capabilities: PROVIDER_CAPABILITIES.map((capability) => ({
      capabilityId: capability.capabilityId,
      version: capability.capabilityVersion,
      name: capability.name,
      description: capability.description,
      inputSchema: capability.inputSchema,
      outputSchema: capability.outputSchema,
      executionMode: 'sync',
      timeoutMs: capability.timeoutMs,
      deterministic: true,
      tags: capability.tags,
      examples: capability.examples,
    })),
    health: { path: HEALTH_PATH },
    authentication: { type: 'none' },
    metadata: {
      project: 'mathir',
      role: 'validator-provider',
      mathirVersion: MATHIR_VERSION,
    },
  };
}

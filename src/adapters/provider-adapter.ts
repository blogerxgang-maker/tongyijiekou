import { Readable } from 'node:stream';
import { ProviderConfig, RouteTarget } from '../core/config-loader';

export type ProviderOperation = 'chat/completions' | 'embeddings';

export interface ProviderCallContext {
  providerId: string;
  provider: ProviderConfig;
  target: RouteTarget;
  alias: string;
  body: Record<string, unknown>;
  operation: ProviderOperation;
  apiKey: string;
  timeoutMs: number;
}

export interface ProviderCallResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  stream?: Readable;
  rawText?: string;
  retryable?: boolean;
}

export interface ProviderAdapter {
  toProviderRequest(context: ProviderCallContext): Record<string, unknown>;
  call(context: ProviderCallContext): Promise<ProviderCallResult>;
  toOpenAICompatibleResponse(providerResponse: unknown, context: ProviderCallContext): unknown;
}

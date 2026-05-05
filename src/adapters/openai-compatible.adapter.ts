import { Injectable } from '@nestjs/common';
import { request } from 'undici';
import { Transform } from 'node:stream';
import { ProviderAdapter, ProviderCallContext, ProviderCallResult } from './provider-adapter';

@Injectable()
export class OpenAICompatibleAdapter implements ProviderAdapter {
  toProviderRequest(context: ProviderCallContext): Record<string, unknown> {
    return {
      ...context.body,
      model: context.target.provider_model
    };
  }

  async call(context: ProviderCallContext): Promise<ProviderCallResult> {
    const url = `${context.provider.base_url.replace(/\/$/, '')}/${context.operation}`;
    const response = await request(url, {
      method: 'POST',
      body: JSON.stringify(this.toProviderRequest(context)),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${context.apiKey}`,
        ...(context.provider.headers ?? {})
      },
      signal: AbortSignal.timeout(context.timeoutMs)
    });

    const headers = response.headers as Record<string, string | string[] | undefined>;
    if (context.body.stream === true && response.statusCode >= 200 && response.statusCode < 300) {
      return {
        statusCode: response.statusCode,
        headers,
        stream: response.body.pipe(this.hideProviderModel(context.target.provider_model, context.alias))
      };
    }

    const rawText = await response.body.text();
    return {
      statusCode: response.statusCode,
      headers,
      body: this.safeJson(rawText),
      rawText
    };
  }

  toOpenAICompatibleResponse(providerResponse: unknown, context: ProviderCallContext): unknown {
    if (!providerResponse || typeof providerResponse !== 'object') {
      return providerResponse;
    }

    return {
      ...(providerResponse as Record<string, unknown>),
      model: context.alias
    };
  }

  private safeJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      return { text: rawText };
    }
  }

  private hideProviderModel(providerModel: string, alias: string): Transform {
    let buffer = '';
    return new Transform({
      transform(chunk, _encoding, callback) {
        buffer += String(chunk);
        let output = '';
        let boundary = findSseBoundary(buffer);

        while (boundary) {
          const event = buffer.slice(0, boundary.index);
          output += rewriteSseEventModel(event, providerModel, alias) + buffer.slice(boundary.index, boundary.index + boundary.length);
          buffer = buffer.slice(boundary.index + boundary.length);
          boundary = findSseBoundary(buffer);
        }

        callback(null, output);
      },
      flush(callback) {
        callback(null, rewriteSseEventModel(buffer, providerModel, alias));
      }
    });
  }
}

function findSseBoundary(value: string): { index: number; length: number } | undefined {
  const lfIndex = value.indexOf('\n\n');
  const crlfIndex = value.indexOf('\r\n\r\n');

  if (lfIndex === -1 && crlfIndex === -1) {
    return undefined;
  }

  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 };
  }

  return { index: lfIndex, length: 2 };
}

function rewriteSseEventModel(event: string, providerModel: string, alias: string): string {
  return event
    .split(/\r?\n/)
    .map((line) => rewriteSseDataLine(line, providerModel, alias))
    .join('\n');
}

function rewriteSseDataLine(line: string, providerModel: string, alias: string): string {
  const match = line.match(/^(\s*data:\s*)(.*)$/);
  if (!match) {
    return line;
  }

  const prefix = match[1];
  const payload = match[2];
  if (payload === '[DONE]') {
    return line;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('model' in parsed)) {
      return line;
    }

    const rewritten = {
      ...(parsed as Record<string, unknown>),
      model: (parsed as { model: unknown }).model === providerModel ? alias : (parsed as { model: unknown }).model
    };
    return `${prefix}${JSON.stringify(rewritten)}`;
  } catch {
    return line;
  }
}

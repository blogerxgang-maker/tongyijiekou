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
    return new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, String(chunk).replaceAll(providerModel, alias));
      }
    });
  }
}

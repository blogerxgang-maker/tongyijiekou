import { Injectable } from '@nestjs/common';
import { request } from 'undici';
import { ProviderAdapter, ProviderCallContext, ProviderCallResult } from './provider-adapter';

type OpenAIMessage = {
  role: string;
  content?: unknown;
};

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string;
};

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  toProviderRequest(context: ProviderCallContext): Record<string, unknown> {
    if (context.operation !== 'chat/completions') {
      throw new Error('Anthropic adapter only supports chat/completions');
    }

    const messages = Array.isArray(context.body.messages)
      ? (context.body.messages as OpenAIMessage[])
      : [];

    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => this.contentToText(message.content))
      .filter(Boolean)
      .join('\n\n');

    const anthropicMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: this.contentToText(message.content)
      }))
      .filter((message): message is AnthropicMessage => message.content.length > 0);

    return {
      model: context.target.provider_model,
      messages: anthropicMessages,
      max_tokens: Number(context.body.max_tokens ?? 1024),
      ...(system ? { system } : {}),
      ...(context.body.temperature !== undefined ? { temperature: context.body.temperature } : {}),
      ...(context.body.top_p !== undefined ? { top_p: context.body.top_p } : {}),
      ...(context.body.stop !== undefined ? { stop_sequences: context.body.stop } : {})
    };
  }

  async call(context: ProviderCallContext): Promise<ProviderCallResult> {
    if (context.body.stream === true) {
      return {
        statusCode: 501,
        headers: {},
        body: {
          error: {
            message: 'Anthropic streaming is not implemented in this MVP adapter',
            type: 'invalid_request_error',
            code: 'streaming_not_supported'
          }
        },
        retryable: true
      };
    }

    const url = `${context.provider.base_url.replace(/\/$/, '')}/messages`;
    const response = await request(url, {
      method: 'POST',
      body: JSON.stringify(this.toProviderRequest(context)),
      headers: {
        'content-type': 'application/json',
        'x-api-key': context.apiKey,
        'anthropic-version': '2023-06-01',
        ...(context.provider.headers ?? {})
      },
      signal: AbortSignal.timeout(context.timeoutMs)
    });

    const rawText = await response.body.text();
    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string | string[] | undefined>,
      body: this.safeJson(rawText),
      rawText
    };
  }

  toOpenAICompatibleResponse(providerResponse: unknown, context: ProviderCallContext): unknown {
    if (!providerResponse || typeof providerResponse !== 'object') {
      return providerResponse;
    }

    const response = providerResponse as Record<string, unknown>;
    const usage = response.usage as Record<string, number> | undefined;
    const inputTokens = Number(usage?.input_tokens ?? 0);
    const outputTokens = Number(usage?.output_tokens ?? 0);

    return {
      id: `chatcmpl-${String(response.id ?? crypto.randomUUID())}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: context.alias,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.extractText(response.content)
          },
          finish_reason: this.mapStopReason(String(response.stop_reason ?? 'end_turn'))
        }
      ],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };
  }

  private contentToText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (part && typeof part === 'object' && 'text' in part) {
            return String((part as { text: unknown }).text ?? '');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  private extractText(content: unknown): string {
    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }

  private mapStopReason(reason: string): string {
    if (reason === 'max_tokens') {
      return 'length';
    }
    if (reason === 'stop_sequence' || reason === 'end_turn') {
      return 'stop';
    }
    return reason;
  }

  private safeJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      return { text: rawText };
    }
  }
}

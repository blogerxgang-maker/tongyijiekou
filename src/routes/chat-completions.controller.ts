import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { OpenAICompatibleAdapter } from '../adapters/openai-compatible.adapter';
import { ProviderAdapter, ProviderCallContext, ProviderOperation } from '../adapters/provider-adapter';
import { GatewayRequest, AuthGuard } from '../core/auth.guard';
import { ConfigLoader, ModelCapability, ProviderConfig } from '../core/config-loader';
import { ModelRouter } from '../core/model-router';
import { UsageLogger } from '../core/usage-logger';

@Controller()
export class ChatCompletionsController {
  constructor(
    private readonly anthropicAdapter: AnthropicAdapter,
    private readonly configLoader: ConfigLoader,
    private readonly modelRouter: ModelRouter,
    private readonly openAICompatibleAdapter: OpenAICompatibleAdapter,
    private readonly usageLogger: UsageLogger
  ) {}

  @Post('/v1/chat/completions')
  @UseGuards(AuthGuard)
  async chatCompletions(@Body() body: Record<string, unknown>, @Req() request: GatewayRequest, @Res() response: Response) {
    await this.handleProviderRequest('chat/completions', 'chat', body, request, response);
  }

  @Post('/v1/embeddings')
  @UseGuards(AuthGuard)
  async embeddings(@Body() body: Record<string, unknown>, @Req() request: GatewayRequest, @Res() response: Response) {
    await this.handleProviderRequest('embeddings', 'embeddings', body, request, response);
  }

  private async handleProviderRequest(
    operation: ProviderOperation,
    capability: ModelCapability,
    body: Record<string, unknown>,
    request: GatewayRequest,
    response: Response
  ) {
    const requestId = randomUUID();
    const project = request.project ?? this.configLoader.anonymousProject();
    const alias = typeof body.model === 'string' ? body.model : '';

    if (!alias) {
      return this.sendOpenAIError(response, 400, 'Missing required field: model', 'invalid_request_error', 'missing_model');
    }

    let route;
    try {
      route = this.modelRouter.resolve(project, alias, capability);
    } catch (error) {
      return this.sendOpenAIError(response, 400, this.messageFromError(error), 'invalid_request_error', 'model_not_available');
    }

    const retryStatusCodes = this.configLoader.retryStatusCodes();
    let lastErrorMessage = 'Provider request failed';
    let lastStatusCode = 502;

    for (const [index, target] of route.attempts.entries()) {
      const provider = this.configLoader.getProvider(target.provider);
      if (!provider) {
        lastErrorMessage = `Unknown provider: ${target.provider}`;
        lastStatusCode = 500;
        continue;
      }

      const apiKey = this.configLoader.getProviderApiKey(provider, target);
      if (!apiKey) {
        lastErrorMessage = `Missing provider API key env: ${target.key_ref ?? provider.api_key_env}`;
        lastStatusCode = 500;
        continue;
      }

      const adapter = this.adapterFor(provider);
      const context: ProviderCallContext = {
        providerId: target.provider,
        provider,
        target,
        alias,
        body,
        operation,
        apiKey,
        timeoutMs: this.configLoader.requestTimeoutMs()
      };

      const startedAt = Date.now();
      try {
        const providerResponse = await adapter.call(context);
        const latencyMs = Date.now() - startedAt;
        const usage = this.extractUsage(providerResponse.body);
        this.usageLogger.log({
          request_id: requestId,
          project: project.id,
          alias,
          provider: target.provider,
          provider_model: target.provider_model,
          latency_ms: latencyMs,
          status_code: providerResponse.statusCode,
          usage
        });

        if (providerResponse.statusCode >= 200 && providerResponse.statusCode < 300) {
          response.setHeader('x-request-id', requestId);

          if (providerResponse.stream) {
            response.status(providerResponse.statusCode);
            response.setHeader('content-type', 'text/event-stream; charset=utf-8');
            response.setHeader('cache-control', 'no-cache, no-transform');
            response.setHeader('connection', 'keep-alive');
            providerResponse.stream.pipe(response);
            return;
          }

          return response.status(providerResponse.statusCode).json(
            adapter.toOpenAICompatibleResponse(providerResponse.body, context)
          );
        }

        lastStatusCode = providerResponse.statusCode;
        lastErrorMessage = this.providerErrorMessage(providerResponse.body, providerResponse.rawText);
        if (retryStatusCodes.has(providerResponse.statusCode) && index < route.attempts.length - 1) {
          continue;
        }

        return this.sendOpenAIError(
          response,
          providerResponse.statusCode,
          lastErrorMessage,
          'provider_error',
          String(providerResponse.statusCode)
        );
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        lastStatusCode = 502;
        lastErrorMessage = this.messageFromError(error);
        this.usageLogger.log({
          request_id: requestId,
          project: project.id,
          alias,
          provider: target.provider,
          provider_model: target.provider_model,
          latency_ms: latencyMs,
          status_code: 502
        });

        if (index < route.attempts.length - 1) {
          continue;
        }
      }
    }

    return this.sendOpenAIError(response, lastStatusCode, lastErrorMessage, 'provider_error', String(lastStatusCode));
  }

  private adapterFor(provider: ProviderConfig): ProviderAdapter {
    if (provider.type === 'anthropic') {
      return this.anthropicAdapter;
    }

    return this.openAICompatibleAdapter;
  }

  private sendOpenAIError(response: Response, statusCode: number, message: string, type: string, code: string) {
    return response.status(statusCode).json({
      error: {
        message,
        type,
        code
      }
    });
  }

  private providerErrorMessage(body: unknown, rawText?: string): string {
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error?: { message?: unknown } }).error;
      if (error?.message) {
        return String(error.message);
      }
    }

    return rawText || 'Provider request failed';
  }

  private extractUsage(body: unknown): unknown {
    if (body && typeof body === 'object' && 'usage' in body) {
      return (body as { usage: unknown }).usage;
    }

    return undefined;
  }

  private messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

@Controller()
export class HealthController {
  @Get('/healthz')
  healthz() {
    return { ok: true };
  }
}

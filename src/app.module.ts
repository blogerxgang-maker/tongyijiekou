import { Module } from '@nestjs/common';
import { AdminController } from './routes/admin.controller';
import { ChatCompletionsController, HealthController } from './routes/chat-completions.controller';
import { ModelsController } from './routes/models.controller';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { AuthGuard } from './core/auth.guard';
import { ConfigLoader } from './core/config-loader';
import { ModelRouter } from './core/model-router';
import { ProviderKeyRotator } from './core/provider-key-rotator';
import { UsageLogger } from './core/usage-logger';

@Module({
  controllers: [AdminController, ChatCompletionsController, HealthController, ModelsController],
  providers: [
    AnthropicAdapter,
    AuthGuard,
    ConfigLoader,
    ModelRouter,
    OpenAICompatibleAdapter,
    ProviderKeyRotator,
    UsageLogger
  ]
})
export class AppModule {}

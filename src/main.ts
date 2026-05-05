import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 8000);

  await app.listen(port, '0.0.0.0');
  console.log(`LLM Gateway listening on http://localhost:${port}`);
}

void bootstrap();

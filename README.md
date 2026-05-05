# Tongyijiekou LLM Gateway

一个 TypeScript + NestJS 实现的统一 LLM Gateway，把多个 AI provider 和真实模型统一成 OpenAI-compatible API。客户端只看内部 alias，例如 `chat-fast`、`chat-best`、`chat-cheap`，不会直接看到 provider API key。

## 功能

- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `GET /v1/models`
- `GET /healthz`
- OpenAI-compatible provider：OpenAI、Groq、DeepSeek、Together、Fireworks、vLLM
- Anthropic adapter：已支持非 stream 的基础 messages API 转换
- `stream=true`：OpenAI-compatible provider 的 SSE 流式转发
- `stream=false`：普通 JSON 返回
- YAML 模型路由：`configs/models.yaml`
- dotenv 加载 provider key
- project API key 鉴权 + model alias 授权
- primary + fallback：遇到 `429/500/502/503/504` 按顺序尝试下一目标，每个 target 最多一次
- UsageLogger 只记录元数据，不记录 prompt/output
- 简易配置后台：`http://localhost:8000/yixi188500`

## 快速开始

```bash
npm install
cp .env.example .env
npm run start:dev
```

默认 project API key 是 `dev-project-key`。真实 provider key 不要写进代码或 YAML，只放进 `.env`：

```env
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
```

健康检查：

```bash
curl http://localhost:8000/healthz
```

## 配置模型路由

编辑 `configs/models.yaml`，或打开配置后台：

```text
http://localhost:8000/yixi188500
```

示例：

```yaml
models:
  chat-fast:
    capabilities: [chat]
    primary:
      provider: groq
      provider_model: llama-3.1-8b-instant
    fallback:
      - provider: openai
        provider_model: gpt-4o-mini
```

客户端请求只传：

```json
{
  "model": "chat-fast",
  "messages": [{"role": "user", "content": "hello"}]
}
```

## curl 示例

Chat completion：

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer dev-project-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat-fast",
    "messages": [
      { "role": "user", "content": "用一句话介绍 NestJS" }
    ]
  }'
```

Streaming：

```bash
curl -N http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer dev-project-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "chat-fast",
    "stream": true,
    "messages": [
      { "role": "user", "content": "连续输出 5 个短句" }
    ]
  }'
```

Embeddings：

```bash
curl http://localhost:8000/v1/embeddings \
  -H "Authorization: Bearer dev-project-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embedding-small",
    "input": "hello world"
  }'
```

Models：

```bash
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer dev-project-key"
```

## OpenAI SDK 示例

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "dev-project-key",
});

const completion = await client.chat.completions.create({
  model: "chat-fast",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(completion.choices[0]?.message?.content);
```

Streaming：

```ts
const stream = await client.chat.completions.create({
  model: "chat-fast",
  stream: true,
  messages: [{ role: "user", content: "逐字输出一句中文" }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## Docker Compose

```bash
cp .env.example .env
docker compose up
```

## 安全说明

- provider API key 只通过环境变量读取，不写死在代码中。
- 默认 usage log 只记录 `request_id/project/alias/provider/provider_model/latency/status/usage`。
- 不默认记录用户 prompt 或模型 output。
- 配置后台没有密码，依赖复杂路径 `/yixi188500`；如暴露公网，请自行加反代鉴权或关闭该路由。

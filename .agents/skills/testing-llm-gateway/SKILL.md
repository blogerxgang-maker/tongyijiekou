---
name: testing-llm-gateway
description: Test the Tongyijiekou LLM Gateway end-to-end. Use when verifying model alias routing, streaming fallback, OpenAI-compatible responses, or the config admin page.
---

# Tongyijiekou LLM Gateway Testing

## Devin Secrets Needed

For real provider E2E tests, save only the provider keys needed by the route under test:

- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `DEEPSEEK_API_KEY`
- `TOGETHER_API_KEY`
- `FIREWORKS_API_KEY`
- `ANTHROPIC_API_KEY`

If these are unavailable, use a local OpenAI-compatible mock provider and non-secret local env values such as `MOCK_OPENAI_API_KEY=test-mock` and `ANTHROPIC_API_KEY=test-anthropic`.

## Local setup

From the repo root:

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

Run the gateway with an explicit config path for controlled tests:

```bash
PORT=8000 \
MODELS_CONFIG_PATH=/path/to/models.e2e.yaml \
ANTHROPIC_API_KEY=test-anthropic \
MOCK_OPENAI_API_KEY=test-mock \
npm run start:dev
```

## Recommended E2E strategy

1. Create a temporary YAML config that defines:
   - one project API key
   - one streaming chat alias with an Anthropic primary and OpenAI-compatible fallback
   - one embedding alias backed by an OpenAI-compatible provider
2. Start a local mock OpenAI-compatible provider with:
   - `POST /v1/chat/completions`
   - `POST /v1/embeddings`
   - a request-log endpoint for verifying provider-facing model names
3. For streaming, make the mock provider split the real model string across upstream chunks. This catches regressions in SSE alias hiding at chunk boundaries.
4. Use a browser-visible runner or UI page for recording when the user asks for visual proof.

## Assertions to cover

- `GET /healthz` returns `200` with `{ "ok": true }`.
- `GET /v1/models` without auth returns `401`.
- Authorized `GET /v1/models` returns only aliases allowed by the temporary YAML.
- The default aliases from `configs/models.yaml` are absent when `MODELS_CONFIG_PATH` points elsewhere.
- `stream=true` chat requests continue past an Anthropic streaming limitation to the OpenAI-compatible fallback.
- Streamed SSE responses expose alias names and do not leak provider model names.
- Embeddings responses expose alias names and do not leak provider model names.
- `/yixi188500` renders the config admin UI and invalid YAML/schema content shows `保存失败`.

## Notes

- Do not use real provider keys in YAML. YAML should contain only environment variable names.
- Usage logs intentionally contain request/provider metadata, not prompt or model output.
- If testing with real providers, keep prompts minimal and non-sensitive.

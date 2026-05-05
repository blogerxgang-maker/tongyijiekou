import { Body, Controller, Get, Header, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigLoader } from '../core/config-loader';

@Controller('yixi188500')
export class AdminController {
  constructor(private readonly configLoader: ConfigLoader) {}

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  index() {
    return this.renderPage(this.configLoader.getRawYaml());
  }

  @Get('config')
  rawConfig() {
    return {
      yaml: this.configLoader.getRawYaml()
    };
  }

  @Post('config')
  saveConfig(@Body('yaml') yaml: string, @Res() response: Response) {
    try {
      this.configLoader.saveRawYaml(yaml);
      response.setHeader('content-type', 'text/html; charset=utf-8');
      return response.send(this.renderPage(this.configLoader.getRawYaml(), '保存成功，配置已重新加载。'));
    } catch (error) {
      response.status(400);
      response.setHeader('content-type', 'text/html; charset=utf-8');
      return response.send(this.renderPage(yaml, `保存失败：${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private renderPage(yaml: string, notice = ''): string {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Gateway Config</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; }
      main { max-width: 1120px; margin: 0 auto; padding: 32px 20px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { color: #94a3b8; }
      textarea { width: 100%; min-height: 70vh; box-sizing: border-box; padding: 16px; border-radius: 12px; border: 1px solid #334155; background: #020617; color: #e2e8f0; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      button { margin-top: 16px; padding: 10px 18px; border: 0; border-radius: 10px; background: #38bdf8; color: #082f49; font-weight: 700; cursor: pointer; }
      .notice { margin: 16px 0; padding: 12px 14px; border-radius: 10px; background: #1e293b; white-space: pre-wrap; }
      .danger { color: #fca5a5; }
    </style>
  </head>
  <body>
    <main>
      <h1>LLM Gateway 配置后台</h1>
      <p>路径即轻量保护：<code>/yixi188500</code>。这里编辑 <code>configs/models.yaml</code>，保存前会校验 schema。</p>
      ${notice ? `<div class="notice">${this.escapeHtml(notice)}</div>` : ''}
      <form method="post" action="/yixi188500/config">
        <textarea name="yaml" spellcheck="false">${this.escapeHtml(yaml)}</textarea>
        <button type="submit">保存并重新加载</button>
      </form>
      <p class="danger">不要把真实 provider API key 写进 YAML；请只写环境变量名。</p>
    </main>
  </body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

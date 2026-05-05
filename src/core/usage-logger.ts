import { Injectable } from '@nestjs/common';

export interface UsageLogEntry {
  request_id: string;
  project: string;
  alias: string;
  provider: string;
  provider_model: string;
  latency_ms: number;
  status_code: number;
  usage?: unknown;
}

@Injectable()
export class UsageLogger {
  log(entry: UsageLogEntry) {
    console.log(JSON.stringify({
      event: 'llm_gateway_usage',
      ...entry,
      ts: new Date().toISOString()
    }));
  }
}

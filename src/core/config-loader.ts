import { Injectable, OnModuleInit } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

const providerTypeSchema = z.enum(['openai-compatible', 'anthropic']);

const headersSchema = z.record(z.string()).default({});

const providerSchema = z.object({
  type: providerTypeSchema,
  base_url: z.string().url(),
  api_key_env: z.string().min(1),
  headers: headersSchema.optional()
});

const targetSchema = z.object({
  provider: z.string().min(1),
  provider_model: z.string().min(1),
  key_ref: z.string().min(1).optional()
});

const modelSchema = z.object({
  primary: targetSchema,
  fallback: z.array(targetSchema).default([]),
  capabilities: z.array(z.enum(['chat', 'embeddings'])).default(['chat']),
  owned_by: z.string().default('llm-gateway')
});

const projectSchema = z.object({
  name: z.string().optional(),
  api_key_env: z.string().optional(),
  api_key: z.string().optional(),
  allowed_models: z.array(z.string()).default(['*'])
});

const configSchema = z.object({
  providers: z.record(providerSchema),
  models: z.record(modelSchema),
  auth: z.object({
    projects: z.record(projectSchema).default({})
  }).default({ projects: {} }),
  policies: z.object({
    retry_status_codes: z.array(z.number().int()).default([429, 500, 502, 503, 504]),
    request_timeout_ms: z.number().int().positive().default(60000)
  }).default({
    retry_status_codes: [429, 500, 502, 503, 504],
    request_timeout_ms: 60000
  })
});

export type ProviderType = z.infer<typeof providerTypeSchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type RouteTarget = z.infer<typeof targetSchema>;
export type ModelConfig = z.infer<typeof modelSchema>;
export type ProjectConfig = z.infer<typeof projectSchema>;
export type GatewayConfig = z.infer<typeof configSchema>;
export type ModelCapability = 'chat' | 'embeddings';

export interface AuthenticatedProject {
  id: string;
  name: string;
  allowedModels: string[];
}

@Injectable()
export class ConfigLoader implements OnModuleInit {
  private config!: GatewayConfig;
  private rawYaml = '';
  private readonly configPath = resolve(process.cwd(), process.env.MODELS_CONFIG_PATH ?? 'configs/models.yaml');

  onModuleInit() {
    this.reload();
  }

  reload() {
    dotenv.config();
    dotenv.config({ path: '.env.local', override: false });

    if (!existsSync(this.configPath)) {
      throw new Error(`Model config not found: ${this.configPath}`);
    }

    this.rawYaml = readFileSync(this.configPath, 'utf8');
    const parsed = YAML.parse(this.rawYaml) as unknown;
    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid models.yaml: ${result.error.message}`);
    }

    this.config = result.data;
    this.validateReferences();
  }

  getConfig(): GatewayConfig {
    return this.config;
  }

  getRawYaml(): string {
    return this.rawYaml;
  }

  saveRawYaml(rawYaml: string) {
    const parsed = YAML.parse(rawYaml) as unknown;
    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(result.error.message);
    }

    writeFileSync(this.configPath, rawYaml, 'utf8');
    this.reload();
  }

  getProvider(providerId: string): ProviderConfig | undefined {
    return this.config.providers[providerId];
  }

  getProviderApiKey(provider: ProviderConfig, target?: RouteTarget): string | undefined {
    const keyRef = target?.key_ref ?? provider.api_key_env;
    return process.env[keyRef];
  }

  getProjectApiKey(project: ProjectConfig): string | undefined {
    if (project.api_key_env && process.env[project.api_key_env]) {
      return process.env[project.api_key_env];
    }

    return project.api_key;
  }

  getModelsForProject(project: AuthenticatedProject): Array<{ id: string; config: ModelConfig }> {
    return Object.entries(this.config.models)
      .filter(([alias]) => this.isModelAllowed(project, alias))
      .map(([id, config]) => ({ id, config }));
  }

  isModelAllowed(project: AuthenticatedProject, alias: string): boolean {
    return project.allowedModels.includes('*') || project.allowedModels.includes(alias);
  }

  anonymousProject(): AuthenticatedProject {
    return {
      id: 'anonymous',
      name: 'anonymous',
      allowedModels: ['*']
    };
  }

  findProjectByApiKey(apiKey: string): AuthenticatedProject | undefined {
    for (const [id, project] of Object.entries(this.config.auth.projects)) {
      const expected = this.getProjectApiKey(project);
      if (expected && expected === apiKey) {
        return {
          id,
          name: project.name ?? id,
          allowedModels: project.allowed_models
        };
      }
    }

    return undefined;
  }

  retryStatusCodes(): Set<number> {
    return new Set(this.config.policies.retry_status_codes);
  }

  requestTimeoutMs(): number {
    return this.config.policies.request_timeout_ms;
  }

  private validateReferences() {
    for (const [alias, model] of Object.entries(this.config.models)) {
      for (const target of [model.primary, ...model.fallback]) {
        if (!this.config.providers[target.provider]) {
          throw new Error(`Model "${alias}" references unknown provider "${target.provider}"`);
        }
      }
    }
  }
}

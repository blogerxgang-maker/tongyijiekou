import { Injectable } from '@nestjs/common';
import {
  AuthenticatedProject,
  ConfigLoader,
  ModelCapability,
  ModelConfig,
  RouteTarget
} from './config-loader';

export interface ModelRoute {
  alias: string;
  model: ModelConfig;
  attempts: RouteTarget[];
}

@Injectable()
export class ModelRouter {
  constructor(private readonly configLoader: ConfigLoader) {}

  resolve(project: AuthenticatedProject, alias: string, capability: ModelCapability): ModelRoute {
    const model = this.configLoader.getConfig().models[alias];
    if (!model) {
      throw new Error(`Unknown model alias: ${alias}`);
    }

    if (!this.configLoader.isModelAllowed(project, alias)) {
      throw new Error(`Project "${project.id}" is not allowed to use model "${alias}"`);
    }

    if (!model.capabilities.includes(capability)) {
      throw new Error(`Model "${alias}" does not support ${capability}`);
    }

    return {
      alias,
      model,
      attempts: [model.primary, ...model.fallback]
    };
  }
}

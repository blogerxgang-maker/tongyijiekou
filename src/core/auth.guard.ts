import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedProject, ConfigLoader } from './config-loader';

export interface GatewayRequest extends Request {
  project?: AuthenticatedProject;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configLoader: ConfigLoader) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const projects = this.configLoader.getConfig().auth.projects;

    if (Object.keys(projects).length === 0) {
      request.project = this.configLoader.anonymousProject();
      return true;
    }

    const authHeader = request.header('authorization') ?? '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Missing Authorization: Bearer <project-api-key>');
    }

    const project = this.configLoader.findProjectByApiKey(match[1].trim());
    if (!project) {
      throw new UnauthorizedException('Invalid project API key');
    }

    request.project = project;
    return true;
  }
}

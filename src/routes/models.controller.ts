import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { GatewayRequest, AuthGuard } from '../core/auth.guard';
import { ConfigLoader } from '../core/config-loader';

@Controller()
export class ModelsController {
  constructor(private readonly configLoader: ConfigLoader) {}

  @Get('/v1/models')
  @UseGuards(AuthGuard)
  listModels(@Req() request: GatewayRequest) {
    const project = request.project ?? this.configLoader.anonymousProject();
    return {
      object: 'list',
      data: this.configLoader.getModelsForProject(project).map(({ id, config }) => ({
        id,
        object: 'model',
        created: 0,
        owned_by: config.owned_by
      }))
    };
  }
}

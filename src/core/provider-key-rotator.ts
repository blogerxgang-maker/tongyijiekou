import { Injectable } from '@nestjs/common';
import { ProviderApiKey, RouteTarget } from './config-loader';

@Injectable()
export class ProviderKeyRotator {
  private readonly nextByRoute = new Map<string, number>();

  order(providerId: string, target: RouteTarget, apiKeys: ProviderApiKey[]): ProviderApiKey[] {
    if (apiKeys.length === 0) {
      return [];
    }

    const routeKey = `${providerId}:${target.provider_model}:${target.key_ref ?? ''}`;
    const next = this.nextByRoute.get(routeKey) ?? 0;
    this.nextByRoute.set(routeKey, (next + 1) % apiKeys.length);

    return [
      ...apiKeys.slice(next),
      ...apiKeys.slice(0, next)
    ];
  }
}

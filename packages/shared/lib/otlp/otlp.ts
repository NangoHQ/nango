import type { RouteConfig } from '@nangohq/logs';
import environmentService from '../services/environment.service.js';

export async function getRoutes(): Promise<RouteConfig[]> {
    const environments = await environmentService.getEnvironmentsWithOtlpSettings();
    return environments.flatMap((env) => {
        if (env.otlp_settings?.endpoint && env.otlp_settings?.headers) {
            return [
                {
                    routingId: `environment:${env.id}`,
                    routingEndpoint: env.otlp_settings?.endpoint,
                    routingHeaders: env.otlp_settings?.headers || {}
                }
            ];
        }
        return [];
    });
}

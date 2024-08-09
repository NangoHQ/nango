import type { ApiIntegration, IntegrationConfig } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    return {
        ...data,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString()
    };
}

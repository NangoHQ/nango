import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig } from '@nangohq/types';
import { basePublicUrl } from '@nangohq/utils';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    return {
        ...data,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString()
    };
}

export function integrationToPublicApi(data: IntegrationConfig, include?: ApiPublicIntegrationInclude): ApiPublicIntegration {
    return {
        unique_key: data.unique_key,
        provider: data.provider,
        logo: `${basePublicUrl}/images/template-logos/${data.provider}.svg`,
        ...include,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString()
    };
}

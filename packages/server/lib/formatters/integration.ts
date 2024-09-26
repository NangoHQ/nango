import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';
import { basePublicUrl } from '@nangohq/utils';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    return {
        ...data,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString()
    };
}

export function integrationToPublicApi({
    integration,
    include,
    provider
}: {
    integration: IntegrationConfig;
    provider: Provider;
    include?: ApiPublicIntegrationInclude;
}): ApiPublicIntegration {
    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...include,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

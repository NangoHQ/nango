import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';
import { basePublicUrl } from '@nangohq/utils';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    const apiIntegration = {
        ...data,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString()
    };

    delete apiIntegration.oauth_client_secret_iv;
    delete apiIntegration.oauth_client_secret_tag;

    return apiIntegration;
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

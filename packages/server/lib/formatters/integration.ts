import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';
import { basePublicUrl } from '@nangohq/utils';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: data.oauth_client_id,
        oauth_client_secret: data.oauth_client_secret,
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: data.app_link,
        custom: data.custom,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields
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

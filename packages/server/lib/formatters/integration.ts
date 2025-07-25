import { basePublicUrl } from '@nangohq/utils';

import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig): ApiIntegration {
    const userDefined = data.user_defined === undefined ? true : data.user_defined;

    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: userDefined ? data.oauth_client_id : '',
        oauth_client_secret: userDefined ? data.oauth_client_secret : '',
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: data.app_link,
        custom: data.custom,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        user_defined: userDefined
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
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        user_defined: integration.user_defined === undefined ? true : integration.user_defined,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

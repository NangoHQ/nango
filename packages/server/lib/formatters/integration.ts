import { basePublicUrl } from '@nangohq/utils';

import type { ApiIntegration, ApiPublicIntegration, ApiPublicIntegrationInclude, IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToApi(data: IntegrationConfig, options?: { includeCredentials?: boolean }): ApiIntegration {
    const hideCredentials = options?.includeCredentials === false || !!data.shared_credentials_id;
    return {
        id: data.id,
        unique_key: data.unique_key,
        provider: data.provider,
        oauth_client_id: hideCredentials ? '' : data.oauth_client_id,
        oauth_client_secret: hideCredentials ? '' : data.oauth_client_secret,
        oauth_scopes: data.oauth_scopes,
        environment_id: data.environment_id,
        app_link: data.app_link,
        custom: hideCredentials ? null : data.custom,
        created_at: data.created_at.toISOString(),
        updated_at: data.updated_at.toISOString(),
        missing_fields: data.missing_fields,
        display_name: data.display_name,
        forward_webhooks: data.forward_webhooks === undefined ? true : data.forward_webhooks,
        shared_credentials_id: data.shared_credentials_id
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
    const genericApiKey = integration.provider === 'generic-api-key' ? genericApiKeyCustomToApi(integration.custom) : undefined;

    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...(genericApiKey ? { generic_api_key: genericApiKey } : {}),
        ...include,
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

function genericApiKeyCustomToApi(custom: IntegrationConfig['custom']): ApiPublicIntegration['generic_api_key'] {
    if (!custom) {
        return undefined;
    }

    const baseUrl = custom['generic_api_key_base_url'];
    const placement = custom['generic_api_key_placement'];
    const name = custom['generic_api_key_name'];
    const valueTemplate = custom['generic_api_key_value_template'];
    if (!baseUrl || (placement !== 'header' && placement !== 'query') || !name || !valueTemplate) {
        return undefined;
    }

    const method = custom['generic_api_key_verification_method'];
    const endpoint = custom['generic_api_key_verification_endpoint'];

    return {
        base_url: baseUrl,
        placement,
        name,
        value_template: valueTemplate,
        ...(endpoint
            ? {
                  verification: {
                      ...(method === 'GET' || method === 'POST' ? { method } : {}),
                      endpoint
                  }
              }
            : {})
    };
}

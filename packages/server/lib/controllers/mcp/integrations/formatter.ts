import { basePublicUrl } from '@nangohq/utils';

import { getPreconfiguredCredentials } from '../../../utils/integrations.js';

import type { IntegrationConfig, Provider } from '@nangohq/types';

export function integrationToMcp({ integration, provider }: { integration: IntegrationConfig; provider: Provider }) {
    const preconfiguredCredentials = getPreconfiguredCredentials(integration.custom, provider);

    return {
        unique_key: integration.unique_key,
        provider: integration.provider,
        display_name: integration.display_name || provider.display_name,
        logo: `${basePublicUrl}/images/template-logos/${integration.provider}.svg`,
        ...(provider.integration_config && integration.custom?.['keyLabel'] ? { credentials_label: { apiKey: integration.custom['keyLabel'] } } : {}),
        ...(preconfiguredCredentials.length > 0 ? { preconfigured_credentials: preconfiguredCredentials } : {}),
        forward_webhooks: integration.forward_webhooks === undefined ? true : integration.forward_webhooks,
        created_at: integration.created_at.toISOString(),
        updated_at: integration.updated_at.toISOString()
    };
}

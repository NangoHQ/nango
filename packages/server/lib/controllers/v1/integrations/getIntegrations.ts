import { configService, countSyncConfigByConfigId, getProvider } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToApi } from '../../../formatters/integration.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { parseConnectionConfigParamsFromTemplate, parseCredentialsParamsFromTemplate } from '../../../utils/utils.js';

import type { ApiIntegrationList, GetIntegrations, ProviderTwoStep } from '@nangohq/types';

export const getIntegrations = asyncWrapper<GetIntegrations>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;

    const integrations = await configService.listIntegrationForApi(environment.id);
    const rawSyncConfig = await countSyncConfigByConfigId(environment.id);
    const activeSyncConfig = new Map();
    for (const syncConfig of rawSyncConfig) {
        activeSyncConfig.set(syncConfig.nango_config_id, Number(syncConfig.count));
    }

    const formattedList = integrations.map((integration) => {
        const provider = getProvider(integration.provider)!;

        const formatted: ApiIntegrationList = {
            ...integrationToApi(integration),
            meta: {
                authMode: provider.auth_mode,
                scriptsCount: activeSyncConfig.get(integration.id!) || 0,
                connectionCount: Number(integration.connection_count),
                creationDate: integration.created_at.toISOString(),
                missingFieldsCount: integration.missing_fields.length,
                displayName: provider.display_name,
                ...(provider.require_client_certificate && { requireClientCertificate: provider.require_client_certificate })
            }
        };

        // Used by legacy connection create
        // TODO: remove this when we remove CreateLegacy.tsx
        if (provider) {
            if (provider.auth_mode !== 'APP' && provider.auth_mode !== 'CUSTOM') {
                formatted.meta['connectionConfigParams'] = parseConnectionConfigParamsFromTemplate(provider);
            }

            // Check if provider is of type ProviderTwoStep or JWT
            if (provider.auth_mode === 'TWO_STEP' || provider.auth_mode === 'JWT') {
                formatted.meta['credentialParams'] = parseCredentialsParamsFromTemplate(provider as ProviderTwoStep);
            }
        }

        return formatted;
    });

    res.status(200).send({ data: formattedList });
});

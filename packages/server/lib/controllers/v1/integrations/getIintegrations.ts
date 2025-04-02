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

    const configs = await configService.listIntegrationForApi(environment.id);

    const integrations = await Promise.all(
        configs.map(async (config) => {
            const provider = getProvider(config.provider)!;
            const activeFlows = await countSyncConfigByConfigId(environment.id, config.id!);

            const integration: ApiIntegrationList = {
                ...integrationToApi(config),
                meta: {
                    authMode: provider.auth_mode,
                    scriptsCount: Number(activeFlows.count),
                    connectionCount: Number(config.connection_count),
                    creationDate: config.created_at.toISOString(),
                    missingFieldsCount: config.missing_fields.length
                }
            };

            // Used by legacy connection create
            // TODO: remove this when we remove CreateLegacy.tsx
            if (provider) {
                if (provider.auth_mode !== 'APP' && provider.auth_mode !== 'CUSTOM') {
                    integration.meta['connectionConfigParams'] = parseConnectionConfigParamsFromTemplate(provider);
                }

                // Check if provider is of type ProviderTwoStep
                if (provider.auth_mode === 'TWO_STEP') {
                    integration.meta['credentialParams'] = parseCredentialsParamsFromTemplate(provider as ProviderTwoStep);
                }
            }

            return integration;
        })
    );

    res.status(200).send({
        data: integrations
    });
});

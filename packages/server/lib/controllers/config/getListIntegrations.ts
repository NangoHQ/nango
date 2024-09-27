import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicListIntegrationsLegacy } from '@nangohq/types';
import { configService, getProviders } from '@nangohq/shared';
import { integrationToPublicApi } from '../../formatters/integration.js';

export const getPublicListIntegrationsLegacy = asyncWrapper<GetPublicListIntegrationsLegacy>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;
    const configs = await configService.listProviderConfigs(environment.id);

    const providers = getProviders();
    if (!providers) {
        res.status(500).send({ error: { code: 'server_error', message: `failed to load providers` } });
        return;
    }

    const results = configs.map((config) => {
        return integrationToPublicApi({ integration: config, provider: providers[config.provider]! });
    });

    res.status(200).send({ configs: results });
});

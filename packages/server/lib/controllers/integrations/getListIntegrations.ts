import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicListIntegrations } from '@nangohq/types';
import { configService, getProviders } from '@nangohq/shared';
import { integrationToPublicApi } from '../../formatters/integration.js';

export const getPublicListIntegrations = asyncWrapper<GetPublicListIntegrations>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment, connectSession } = res.locals;
    let configs = await configService.listProviderConfigs(environment.id);

    const providers = getProviders();
    if (!providers) {
        res.status(500).send({ error: { code: 'server_error', message: `failed to load providers` } });
        return;
    }

    if (connectSession?.allowedIntegrations) {
        configs = configs.filter((config) => {
            return connectSession.allowedIntegrations?.includes(config.unique_key);
        });
    }

    res.status(200).send({
        data: configs.map((config) => {
            return integrationToPublicApi({ integration: config, provider: providers[config.provider]! });
        })
    });
});

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { configService, getProviders } from '@nangohq/shared';
import { integrationToApi } from '../../../formatters/integration.js';
import type { GetIntegrations } from '@nangohq/types';

export const getIntegrations = asyncWrapper<GetIntegrations>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;
    const integrations = await configService.listProviderConfigs(environment.id);

    const providers = getProviders();
    if (!providers) {
        res.status(500).send({ error: { code: 'server_error', message: `failed to load providers` } });
        return;
    }

    res.status(200).send({
        data: integrations.map((integration) => {
            return integrationToApi(integration);
        })
    });
});

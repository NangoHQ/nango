import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetListIntegrations } from '@nangohq/types';
import { configService } from '@nangohq/shared';

export const getListIntegrations = asyncWrapper<GetListIntegrations>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;
    const configs = await configService.listProviderConfigs(environment.id);
    const results = configs.map((config) => {
        return { unique_key: config.unique_key, provider: config.provider };
    });
    res.status(200).send({ configs: results });
});

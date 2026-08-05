import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToPublicApi } from '../../formatters/integration.js';
import integrationService from '../../services/integration.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetPublicListIntegrations } from '@nangohq/types';

export const getPublicListIntegrations = asyncWrapper<GetPublicListIntegrations>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment, connectSession } = res.locals;
    const result = await integrationService.list({
        environmentId: environment.id,
        allowedIntegrations: connectSession?.allowedIntegrations
    });
    if (result.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: result.error.message } });
        return;
    }

    res.status(200).send({
        data: result.value.map(({ integration, provider }) => integrationToPublicApi({ integration, provider }))
    });
});

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicIntegration } from '@nangohq/types';
import { configService } from '@nangohq/shared';
import { z } from 'zod';
import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { integrationToPublicApi } from '../../../formatters/integration.js';

export const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema
    })
    .strict();

export const getPublicIntegration = asyncWrapper<GetPublicIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const params: GetPublicIntegration['Params'] = valParams.data;

    const integration = await configService.getProviderConfig(params.uniqueKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration "${params.uniqueKey}" does not exist` } });
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi(integration)
    });
});

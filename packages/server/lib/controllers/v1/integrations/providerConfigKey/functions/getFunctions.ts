import * as z from 'zod';

import { configService, listFunctions } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { GetIntegrationFunctions } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        type: z.enum(['sync', 'action', 'on-event']).optional(),
        page: z.coerce.number().int().min(0).optional().default(0),
        limit: z.coerce.number().int().min(1).max(100).optional().default(20)
    })
    .strict();

export const getIntegrationFunctions = asyncWrapper<GetIntegrationFunctions>(async (req, res) => {
    const queryStringValues = querystringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey } = valParams.data;
    const { type, page, limit } = queryStringValues.data;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const { rows, total } = await listFunctions({
        environmentId: environment.id,
        providerConfigKey,
        type,
        limit,
        offset: page * limit
    });

    res.status(200).send({ data: rows, pagination: { total, page, limit } });
});

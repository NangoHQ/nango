import * as z from 'zod';

import { configService, listFunctions } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { GetIntegrationFunctions } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        type: z.enum(['sync', 'action', 'on-event']).optional(),
        search: z.string().trim().min(1).max(255).optional(),
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
    const { type, search, page, limit } = queryStringValues.data;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const fnResult = await listFunctions({
        environmentId: environment.id,
        providerConfigKey,
        type,
        search,
        limit,
        offset: page * limit
    });

    if (fnResult.isErr()) {
        report(fnResult.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
        return;
    }

    const { rows, total } = fnResult.value;

    res.status(200).send({ data: rows, pagination: { total, page, limit } });
});

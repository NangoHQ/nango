import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema, functionListQueryFields } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';
import { handleListIntegrationFunctions } from './helpers.js';

import type { GetIntegrationFunctions } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        ...functionListQueryFields
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

    await handleListIntegrationFunctions({ res, environment, providerConfigKey, type, search, page, limit });
});

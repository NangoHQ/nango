import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { deletableFunctionTypeSchema, envSchema, providerConfigKeySchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { handleDeleteIntegrationFunction } from './helpers.js';

import type { DeleteIntegrationFunction } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        // Required (unlike GET) to disambiguate a sync and an action that share a name.
        type: deletableFunctionTypeSchema
    })
    .strict();

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema,
        functionName: z.string().min(1).max(255)
    })
    .strict();

export const deleteIntegrationFunction = asyncWrapper<DeleteIntegrationFunction>(async (req, res) => {
    const queryStringValues = querystringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) } });
        return;
    }

    const valParams = paramsValidation.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey, functionName } = valParams.data;
    const { type } = queryStringValues.data;

    await handleDeleteIntegrationFunction({ res, environment, providerConfigKey, name: functionName, type });
});

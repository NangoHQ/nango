import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema, functionTypeSchema, providerConfigKeySchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { handleGetFunctionCode } from '../../../../shared/integrations/functions/getCode.js';

import type { GetFunctionCode } from '@nangohq/types';

const querystringValidation = z
    .object({
        env: envSchema,
        type: functionTypeSchema.optional()
    })
    .strict();

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema,
        functionName: z.string().min(1).max(255)
    })
    .strict();

export const getIntegrationFunctionCode = asyncWrapper<GetFunctionCode>(async (req, res) => {
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

    await handleGetFunctionCode({ res, environment, providerConfigKey, name: functionName, type });
});

import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema, functionTypeSchema, providerNameSchema, scriptNameSchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { handleGetProviderTemplateCode } from '../../../../shared/providers/templates/getCode.js';

import type { GetProviderTemplateCode } from '@nangohq/types';

const validationParams = z
    .object({
        providerConfigKey: providerNameSchema,
        name: scriptNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        env: envSchema,
        type: functionTypeSchema.optional()
    })
    .strict();

export const getProviderTemplateCode = asyncWrapper<GetProviderTemplateCode>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    await handleGetProviderTemplateCode({ res, provider: valParams.data.providerConfigKey, name: valParams.data.name, type: valQuery.data.type });
});

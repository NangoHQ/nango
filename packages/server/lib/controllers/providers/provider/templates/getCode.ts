import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { functionTypeSchema, providerNameSchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleGetProviderTemplateCode } from '../../../shared/providers/templates/getCode.js';

import type { GetPublicProviderTemplateCode } from '@nangohq/types';

const validationParams = z
    .object({
        provider: providerNameSchema,
        name: scriptNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        type: functionTypeSchema.optional()
    })
    .strict();

export const getPublicProviderTemplateCode = asyncWrapper<GetPublicProviderTemplateCode>(async (req, res) => {
    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    await handleGetProviderTemplateCode({ res, provider: valParams.data.provider, name: valParams.data.name, type: valQuery.data.type });
});

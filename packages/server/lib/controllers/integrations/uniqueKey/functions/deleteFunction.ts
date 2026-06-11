import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { deletableFunctionTypeSchema, providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleDeleteIntegrationFunction } from '../../../v1/integrations/providerConfigKey/functions/deleteFunction.js';

import type { DeletePublicIntegrationFunction } from '@nangohq/types';

const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema,
        name: scriptNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        // Required (unlike GET) to disambiguate a sync and an action that share a name.
        type: deletableFunctionTypeSchema
    })
    .strict();

export const deletePublicIntegrationFunction = asyncWrapper<DeletePublicIntegrationFunction>(async (req, res) => {
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

    const { environment } = res.locals;
    const { uniqueKey, name } = valParams.data;
    const { type } = valQuery.data;

    await handleDeleteIntegrationFunction({ res, environment, providerConfigKey: uniqueKey, name, type });
});

import * as z from 'zod';

import { report, zodErrorToHTTP } from '@nangohq/utils';

import { catalogFunctionDetailToApi } from '../../../../../formatters/catalog.js';
import { providerNameSchema, scriptNameSchema } from '../../../../../helpers/validation.js';
import catalogService from '../../../../../services/catalog.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { catalogFunctionTypeFilterSchema } from '../../../validation.js';

import type { GetPublicCatalogFunction } from '@nangohq/types';

const validationParams = z
    .object({
        provider: providerNameSchema,
        name: scriptNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        type: catalogFunctionTypeFilterSchema.optional()
    })
    .strict();

export const getPublicCatalogFunction = asyncWrapper<GetPublicCatalogFunction>((req, res) => {
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

    const { provider, name } = valParams.data;
    const result = catalogService.getFunction({ provider, name, type: valQuery.data.type });
    if (result.isErr()) {
        if (result.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: result.error.message } });
            return;
        }

        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get function' } });
        return;
    }

    res.status(200).send({ data: catalogFunctionDetailToApi(result.value) });
});

import * as z from 'zod';

import { report, zodErrorToHTTP } from '@nangohq/utils';

import { catalogFunctionToApi } from '../../../../../formatters/catalog.js';
import { paginationQueryFields, providerNameSchema } from '../../../../../helpers/validation.js';
import catalogService from '../../../../../services/catalog.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { catalogFunctionTypeFilterSchema, catalogSearchSchema } from '../../../validation.js';

import type { GetPublicCatalogFunctions } from '@nangohq/types';

const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

const validationQuery = z
    .object({
        type: catalogFunctionTypeFilterSchema.optional(),
        search: catalogSearchSchema.optional(),
        ...paginationQueryFields
    })
    .strict();

export const getPublicCatalogFunctions = asyncWrapper<GetPublicCatalogFunctions>((req, res) => {
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

    const { type, search, page, limit } = valQuery.data;
    const result = catalogService.listFunctions({ provider: valParams.data.provider, type, search, page, limit });
    if (result.isErr()) {
        if (result.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: result.error.message } });
            return;
        }

        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
        return;
    }

    res.status(200).send({
        data: result.value.functions.map(catalogFunctionToApi),
        pagination: { total: result.value.total, page, limit }
    });
});

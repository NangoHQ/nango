import * as z from 'zod';

import { report, zodErrorToHTTP } from '@nangohq/utils';

import { catalogProviderToApi } from '../../../formatters/catalog.js';
import { paginationQueryFields } from '../../../helpers/validation.js';
import catalogService from '../../../services/catalog.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { catalogSearchSchema } from '../validation.js';

import type { GetPublicCatalogProviders } from '@nangohq/types';

const validationQuery = z
    .object({
        search: catalogSearchSchema.optional(),
        ...paginationQueryFields
    })
    .strict();

export const getPublicCatalogProviders = asyncWrapper<GetPublicCatalogProviders>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { search, page, limit } = valQuery.data;
    const result = await catalogService.searchProviders({ search, page, limit });
    if (result.isErr()) {
        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list providers' } });
        return;
    }

    res.status(200).send({
        data: result.value.providers.map(catalogProviderToApi),
        pagination: { total: result.value.total, page, limit }
    });
});

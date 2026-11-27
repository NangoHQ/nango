import * as z from 'zod';

import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { catalogProviderToApi } from '../../../formatters/catalog.js';
import { providerNameSchema } from '../../../helpers/validation.js';
import catalogService from '../../../services/catalog.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetPublicCatalogProvider } from '@nangohq/types';

const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

export const getPublicCatalogProvider = asyncWrapper<GetPublicCatalogProvider>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const result = await catalogService.getProvider(valParams.data.provider);
    if (result.isErr()) {
        if (result.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: result.error.message } });
            return;
        }

        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get provider' } });
        return;
    }

    res.status(200).send({ data: catalogProviderToApi(result.value) });
});

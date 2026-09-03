import * as z from 'zod';

import { errorManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerTemplatesToApi } from '../../../../formatters/provider.js';
import { providerNameSchema } from '../../../../helpers/validation.js';
import providerService from '../../../../services/provider.service.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetPublicProviderTemplates } from '@nangohq/types';

const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

export const getPublicProviderTemplates = asyncWrapper<GetPublicProviderTemplates>((req, res) => {
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

    const result = providerService.listTemplates({ providerName: valParams.data.provider });
    if (result.isErr()) {
        errorManager.report(result.error.cause instanceof Error ? result.error.cause : result.error);
        res.status(500).send({ error: { code: 'server_error', message: result.error.message } });
        return;
    }

    res.status(200).send({ data: providerTemplatesToApi(result.value) });
});

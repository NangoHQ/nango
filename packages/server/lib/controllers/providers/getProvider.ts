import * as z from 'zod';

import { errorManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerToApi } from '../../formatters/provider.js';
import { providerNameSchema } from '../../helpers/validation.js';
import providerService from '../../services/provider.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetPublicProvider } from '@nangohq/types';

export const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

export const getPublicProvider = asyncWrapper<GetPublicProvider>((req, res) => {
    const queryValue = requireEmptyQuery(req);
    if (queryValue) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryValue.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const lang = res.locals['lang'];

    const params: GetPublicProvider['Params'] = valParams.data;
    const result = providerService.get({ providerName: params.provider, language: lang });
    if (result.isErr()) {
        if (result.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: result.error.message } });
            return;
        }

        errorManager.report(result.error.cause instanceof Error ? result.error.cause : result.error);
        res.status(500).send({ error: { code: 'server_error', message: result.error.message } });
        return;
    }

    res.status(200).send({ data: providerToApi(result.value) });
});

import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { providerNameSchema } from '../../helpers/validation.js';
import type { GetPublicProvider } from '@nangohq/types';
import { getProvider } from '@nangohq/shared';

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

    const params: GetPublicProvider['Params'] = valParams.data;
    const provider = getProvider(params.provider);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: 'Unknown provider' } });
        return;
    }

    res.status(200).send({ data: { ...provider, name: params.provider } });
});

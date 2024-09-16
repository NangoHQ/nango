import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { providerNameSchema } from '../../helpers/validation.js';
import type { GetPublicProvider } from '@nangohq/types';
import { getProvider } from '@nangohq/shared';

export const validationParams = z
    .object({
        providerName: providerNameSchema
    })
    .strict();

export const getPublicProvider = asyncWrapper<GetPublicProvider>((req, res) => {
    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryValue = requireEmptyQuery(req.query);
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
    const provider = getProvider(params.providerName);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: 'Unknown provider' } });
        return;
    }

    res.status(200).send({ data: { ...provider, name: params.providerName } });
});

import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import { providerConfigKeySchema } from '../../helpers/validation.js';
import type { ApiProvider, GetPublicProviders } from '@nangohq/types';
import { getProviders } from '@nangohq/shared';

const queryStringValidation = z
    .object({
        search: providerConfigKeySchema.optional()
    })
    .strict();

export const getPublicProviders = asyncWrapper<GetPublicProviders>((req, res) => {
    const queryValue = queryStringValidation.safeParse(req.query);
    if (!queryValue.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryValue.error) } });
        return;
    }

    const queries: GetPublicProviders['Querystring'] = queryValue.data;
    const providers = getProviders();
    if (!providers) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to load providers' } });
        return;
    }

    let filtered: ApiProvider[] = [];
    if (queries.search) {
        const reg = new RegExp(queries.search, 'i');
        for (const providerName of Object.keys(providers)) {
            if (reg.test(providerName)) {
                filtered.push({ ...providers[providerName]!, name: providerName });
            }
        }
    } else {
        filtered = Object.entries(providers).map(([name, provider]) => {
            return { ...provider, name };
        });
    }

    res.status(200).send({ data: filtered });
});

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { handleGetProviderTemplates } from './helpers.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../../getProvider.js';

import type { GetProviderTemplates } from '@nangohq/types';

export const getProviderTemplates = asyncWrapper<GetProviderTemplates>((req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { providerConfigKey } = valParams.data;

    handleGetProviderTemplates({ res, providerConfigKey });
});

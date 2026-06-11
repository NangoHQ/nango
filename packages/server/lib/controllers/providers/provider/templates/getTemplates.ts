import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleGetProviderTemplates } from '../../../v1/providers/providerConfigKey/templates/getTemplates.js';

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

    const { provider } = valParams.data;

    handleGetProviderTemplates({ res, providerConfigKey: provider });
});

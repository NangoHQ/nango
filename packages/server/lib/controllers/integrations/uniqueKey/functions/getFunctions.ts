import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { functionListQueryFields, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleListIntegrationFunctions } from '../../../shared/integrations/functions/listFunctions.js';

import type { GetPublicIntegrationFunctions } from '@nangohq/types';

const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema
    })
    .strict();

const validationQuery = z.object({ ...functionListQueryFields }).strict();

export const getPublicIntegrationFunctions = asyncWrapper<GetPublicIntegrationFunctions>(async (req, res) => {
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

    const { environment } = res.locals;
    const { uniqueKey } = valParams.data;
    const { type, search, page, limit } = valQuery.data;

    await handleListIntegrationFunctions({ res, environment, providerConfigKey: uniqueKey, type, search, page, limit });
});

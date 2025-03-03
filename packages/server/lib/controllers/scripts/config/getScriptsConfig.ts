import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { providerNameSchema } from '../../../helpers/validation.js';
import type { GetPublicScriptsConfig } from '@nangohq/types';
import { getSyncConfigsAsStandardConfig } from '@nangohq/shared';

export const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

export const getPublicScriptsConfig = asyncWrapper<GetPublicScriptsConfig>(async (req, res) => {
    const queryValue = requireEmptyQuery(req);
    if (queryValue) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryValue.error) } });
        return;
    }

    const { environment } = res.locals;

    const nangoConfigs = await getSyncConfigsAsStandardConfig(environment.id);

    res.status(200).send(nangoConfigs || []);
});

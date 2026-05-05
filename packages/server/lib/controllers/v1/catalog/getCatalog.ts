import * as z from 'zod';

import { flowService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { providerSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetProviderFunctionCatalog, NangoSyncConfig } from '@nangohq/types';

const queryStringValidation = z
    .object({
        env: z.string(),
        provider: providerSchema.optional()
    })
    .strict();

export const getCatalog = asyncWrapper<GetProviderFunctionCatalog>((req, res) => {
    const valQuery = queryStringValidation.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const { provider } = valQuery.data;
    const all = flowService.getAllAvailableFlowsAsStandardConfig();
    const matching = provider ? all.filter((entry) => entry.providerConfigKey === provider) : all;

    const data: NangoSyncConfig[] = [];
    for (const entry of matching) {
        data.push(...entry.actions, ...entry.syncs);
    }

    res.status(200).send({ data });
});

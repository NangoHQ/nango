import { flowService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunction } from '../../../../../formatters/function.js';
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
    const all = flowService.getAllAvailableFlowsAsStandardConfig();
    const entry = all.find((value) => value.providerConfigKey === providerConfigKey);
    const data = entry ? [...entry.actions, ...entry.syncs].map(toNangoFunction) : [];

    res.status(200).send({ data });
});

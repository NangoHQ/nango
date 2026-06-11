import { flowService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunction } from '../../../../../formatters/function.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../../getProvider.js';

import type { RequestLocals } from '../../../../../utils/express.js';
import type { GetProviderTemplates } from '@nangohq/types';
import type { Response } from 'express';

export function handleGetProviderTemplates({
    res,
    providerConfigKey
}: {
    res: Response<GetProviderTemplates['Reply'], Required<RequestLocals>>;
    providerConfigKey: string;
}): void {
    const all = flowService.getAllAvailableFlowsAsStandardConfig();
    const entry = all.find((value) => value.providerConfigKey === providerConfigKey);
    const data = entry
        ? [...entry.actions, ...entry.syncs].flatMap((e) => {
              const fn = toNangoFunction(e);
              return fn ? [fn] : [];
          })
        : [];

    res.status(200).send({ data });
}

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

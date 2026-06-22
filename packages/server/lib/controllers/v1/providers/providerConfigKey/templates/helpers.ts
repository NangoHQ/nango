import { flowService } from '@nangohq/shared';

import { toNangoFunction } from '../../../../../formatters/function.js';

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

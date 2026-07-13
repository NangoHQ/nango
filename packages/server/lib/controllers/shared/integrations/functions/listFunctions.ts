import { configService, listFunctions } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../../utils/express.js';
import type { DBEnvironment, FunctionType, GetIntegrationFunctions } from '@nangohq/types';
import type { Response } from 'express';

export async function handleListIntegrationFunctions({
    res,
    environment,
    providerConfigKey,
    type,
    search,
    page,
    limit
}: {
    res: Response<GetIntegrationFunctions['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    page: number;
    limit: number;
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const fnResult = await listFunctions({
        environmentId: environment.id,
        providerConfigKey,
        type,
        search,
        limit,
        offset: page * limit
    });

    if (fnResult.isErr()) {
        report(fnResult.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
        return;
    }

    const { rows, total } = fnResult.value;

    res.status(200).send({ data: rows, pagination: { total, page, limit } });
}

import { configService, getFunction } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../../utils/express.js';
import type { DBEnvironment, FunctionType, GetIntegrationFunction } from '@nangohq/types';
import type { Response } from 'express';

export async function handleGetIntegrationFunction({
    res,
    environment,
    providerConfigKey,
    name,
    type
}: {
    res: Response<GetIntegrationFunction['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    providerConfigKey: string;
    name: string;
    type: FunctionType | undefined;
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const fnResult = await getFunction({
        environmentId: environment.id,
        providerConfigKey,
        name,
        type
    });

    if (fnResult.isErr()) {
        report(fnResult.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get function' } });
        return;
    }

    if (!fnResult.value) {
        res.status(404).send({ error: { code: 'not_found', message: 'Function does not exist' } });
        return;
    }

    res.status(200).send({ data: fnResult.value });
}

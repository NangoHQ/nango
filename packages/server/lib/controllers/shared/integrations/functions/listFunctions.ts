import { legacyFunctionService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocalsWithEnvironment } from '../../../../utils/express.js';
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
    res: Response<GetIntegrationFunctions['Reply'], RequestLocalsWithEnvironment>;
    environment: DBEnvironment;
    providerConfigKey: string;
    type: FunctionType | undefined;
    search: string | undefined;
    page: number;
    limit: number;
}): Promise<void> {
    const fnResult = await legacyFunctionService.listFunctions({
        environmentId: environment.id,
        providerConfigKey,
        type,
        search,
        limit,
        offset: page * limit
    });

    if (fnResult.isErr()) {
        const code = fnResult.error.code;
        switch (code) {
            case 'integration_not_found':
                res.status(404).send({ error: { code: 'not_found', message: fnResult.error.message } });
                return;
            case 'list_failed':
                report(fnResult.error);
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
                return;
            default: {
                const exhaustiveCheck: never = code;
                report(new Error('unexpected_list_functions_error', { cause: exhaustiveCheck }));
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to list functions' } });
                return;
            }
        }
    }

    const { rows, total } = fnResult.value;

    res.status(200).send({ data: rows, pagination: { total, page, limit } });
}

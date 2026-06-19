import { configService, getFunction, listFunctions } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import { startFunctionDeletion } from '../../../../../tasks/startFunctionDeletion.js';

import type { RequestLocals } from '../../../../../utils/express.js';
import type { DBEnvironment, DeleteIntegrationFunction, FunctionType, GetIntegrationFunction, GetIntegrationFunctions } from '@nangohq/types';
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

export async function handleDeleteIntegrationFunction({
    res,
    environment,
    providerConfigKey,
    name,
    type
}: {
    res: Response<DeleteIntegrationFunction['Reply'], Required<RequestLocals>>;
    environment: DBEnvironment;
    providerConfigKey: string;
    name: string;
    type: 'sync' | 'action';
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const fnResult = await getFunction({ environmentId: environment.id, providerConfigKey, name, type });
    if (fnResult.isErr()) {
        report(fnResult.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get function' } });
        return;
    }
    if (!fnResult.value) {
        res.status(404).send({ error: { code: 'not_found', message: 'Function does not exist' } });
        return;
    }

    const fn = fnResult.value;
    if (fn.source === 'repo') {
        res.status(400).send({
            error: { code: 'function_managed_by_deploy', message: 'repo functions are deleted through `nango deploy`, not this endpoint' }
        });
        return;
    }

    const enqueued = await startFunctionDeletion({
        syncConfigId: fn.id,
        environmentId: environment.id,
        models: fn.type === 'on-event' ? [] : fn.returns
    });
    if (enqueued.isErr()) {
        report(enqueued.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to enqueue function deletion' } });
        return;
    }

    res.status(200).send({ data: { success: true } });
}

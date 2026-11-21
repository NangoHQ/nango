import db from '@nangohq/database';
import { configService, functionConfigService, functionLookupService } from '@nangohq/shared';
import { Err, Ok, report } from '@nangohq/utils';

import { startFunctionDeletion } from '../../../../tasks/startFunctionDeletion.js';

import type { FunctionDeletionParams } from '../../../../tasks/startFunctionDeletion.js';
import type { RequestLocalsWithEnvironment } from '../../../../utils/express.js';
import type { DBEnvironment, DeleteIntegrationFunction, FunctionListSource, RunnableFunctionType } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Response } from 'express';

type DeletionTarget = {
    source: FunctionListSource;
    params: FunctionDeletionParams | null;
};

async function resolveDeletionTarget({
    environmentId,
    providerConfigKey,
    name,
    type
}: {
    environmentId: number;
    providerConfigKey: string;
    name: string;
    type: RunnableFunctionType;
}): Promise<Result<DeletionTarget | undefined>> {
    if (type === 'tool' || type === 'function') {
        const found = await functionConfigService.search(db.knex, {
            environmentId,
            filter: {
                integrationKey: providerConfigKey,
                name,
                ...(type === 'tool' && { trigger: { kind: 'http', subscriptions: 'none' } })
            }
        });
        if (found.isErr()) {
            return Err(found.error);
        }
        const fn = found.value[0];
        if (fn) {
            return Ok({
                source: fn.currentVersion.source,
                params: { functionConfigId: fn.config.id, environmentId }
            });
        }
        if (type === 'function') {
            return Ok(undefined);
        }
    }

    const found = await functionLookupService.getFunction({ environmentId, providerConfigKey, name, type: type === 'tool' ? 'action' : type });
    if (found.isErr()) {
        return Err(found.error);
    }
    const fn = found.value;
    if (!fn) {
        return Ok(undefined);
    }
    if (fn.id === null) {
        return Ok({ source: fn.source, params: null });
    }
    return Ok({
        source: fn.source,
        params: { syncConfigId: fn.id, environmentId, models: fn.type === 'sync' || fn.type === 'action' ? fn.returns : [] }
    });
}

export async function handleDeleteIntegrationFunction({
    res,
    environment,
    providerConfigKey,
    name,
    type
}: {
    res: Response<DeleteIntegrationFunction['Reply'], RequestLocalsWithEnvironment>;
    environment: DBEnvironment;
    providerConfigKey: string;
    name: string;
    type: RunnableFunctionType;
}): Promise<void> {
    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const fnResult = await resolveDeletionTarget({
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
    const fn = fnResult.value;
    if (!fn) {
        res.status(404).send({ error: { code: 'not_found', message: 'Function does not exist' } });
        return;
    }
    if (fn.source === 'repo') {
        res.status(400).send({
            error: { code: 'function_managed_by_deploy', message: 'repo functions are deleted through `nango deploy`, not this endpoint' }
        });
        return;
    }
    if (fn.source === 'tools-catalog') {
        res.status(400).send({ error: { code: 'invalid_request', message: 'Catalog functions cannot be deleted' } });
        return;
    }
    if (!fn.params) {
        report(new Error(`Function '${name}' is missing a deletion target`));
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to enqueue function deletion' } });
        return;
    }

    const enqueued = await startFunctionDeletion(fn.params);
    if (enqueued.isErr()) {
        report(enqueued.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to enqueue function deletion' } });
        return;
    }

    res.status(200).send({ data: { success: true } });
}

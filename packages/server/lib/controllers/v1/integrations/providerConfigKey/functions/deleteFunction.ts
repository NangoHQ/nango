import * as z from 'zod';

import { configService, getFunction } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { deletableFunctionTypeSchema, envSchema, providerConfigKeySchema } from '../../../../../helpers/validation.js';
import { startFunctionDeletion } from '../../../../../tasks/startFunctionDeletion.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { RequestLocals } from '../../../../../utils/express.js';
import type { DBEnvironment, DeleteIntegrationFunction } from '@nangohq/types';
import type { Response } from 'express';

const querystringValidation = z
    .object({
        env: envSchema,
        // Required (unlike GET) to disambiguate a sync and an action that share a name.
        type: deletableFunctionTypeSchema
    })
    .strict();

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema,
        functionName: z.string().min(1).max(255)
    })
    .strict();

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
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete function' } });
        return;
    }

    res.status(200).send({ data: { success: true } });
}

export const deleteIntegrationFunction = asyncWrapper<DeleteIntegrationFunction>(async (req, res) => {
    const queryStringValues = querystringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) } });
        return;
    }

    const valParams = paramsValidation.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey, functionName } = valParams.data;
    const { type } = queryStringValues.data;

    await handleDeleteIntegrationFunction({ res, environment, providerConfigKey, name: functionName, type });
});

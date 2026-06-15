import {
    FunctionError,
    createFunctionDeployment,
    markFunctionDeploymentFailed,
    markFunctionDeploymentRunning,
    prepareAsyncDeploy,
    toFunctionDeploymentCreate
} from '@nangohq/sandbox';
import { configService, getSyncConfigRaw } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { getFunctionCallbackBaseUrl } from '../helpers.js';
import { functionDeploymentBodySchema } from '../validation.js';
import { createDeploySandboxApiKey, requireCustomerKeyId, toFunctionDeploymentError } from './helpers.js';

import type { DBSyncConfig, PostFunctionDeployment } from '@nangohq/types';

function isProtectedExistingFunction(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null): boolean {
    return Boolean(existingSyncConfig && existingSyncConfig.source !== 'standalone');
}

function shouldAllowDestructiveDeploy(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null, allowDestructive: boolean): boolean {
    return Boolean(allowDestructive && existingSyncConfig?.source === 'standalone');
}

export const postFunctionDeployment = asyncWrapper<PostFunctionDeployment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = functionDeploymentBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;
    const parentCustomerKeyId = requireCustomerKeyId(res, 'Function deployments can only be started from a customer API key');
    if (!parentCustomerKeyId) {
        return;
    }

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
        return;
    }

    const existingSyncConfig = await getSyncConfigRaw({
        environmentId: environment.id,
        config_id: providerConfig.id,
        name: body.function_name,
        isAction: body.function_type === 'action'
    });

    if (isProtectedExistingFunction(existingSyncConfig)) {
        res.status(400).send({
            error: {
                code: 'invalid_request',
                message: `Cannot overwrite existing function '${body.function_name}'`
            }
        });
        return;
    }

    const allowDestructiveDeploy = shouldAllowDestructiveDeploy(existingSyncConfig, body.allow_destructive);
    const deploymentResult = await createFunctionDeployment({
        environmentId: environment.id,
        request: {
            type: 'function',
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            ...(body.version ? { version: body.version } : {}),
            allow_destructive: allowDestructiveDeploy
        }
    });
    if (deploymentResult.isErr()) {
        sendStepError({ res, status: 500, error: deploymentResult.error });
        return;
    }

    const deployment = deploymentResult.value;
    let prepared: Awaited<ReturnType<typeof prepareAsyncDeploy>> | null = null;
    try {
        const nangoHost = getFunctionCallbackBaseUrl();
        const sandboxApiKey = await createDeploySandboxApiKey(parentCustomerKeyId, environment.id, deployment.id);
        if (sandboxApiKey.isErr()) {
            throw sandboxApiKey.error;
        }

        const callbackUrl = new URL(`/functions/deployments/${deployment.id}/result`, nangoHost).toString();
        prepared = await prepareAsyncDeploy({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            nango_secret_key: sandboxApiKey.value,
            nango_host: nangoHost,
            deployment_id: deployment.id,
            callback_url: callbackUrl,
            ...(body.version ? { version: body.version } : {}),
            allow_destructive: allowDestructiveDeploy
        });

        const running = await markFunctionDeploymentRunning({
            environmentId: environment.id,
            id: deployment.id,
            sandboxId: prepared.sandboxId,
            startedAt: prepared.startedAt,
            executionTimeoutAt: prepared.executionTimeoutAt
        });
        if (!running) {
            await prepared.kill();
            throw new Error(`Failed to mark function deployment '${deployment.id}' as running`);
        }

        await prepared.start();

        res.status(202).send(toFunctionDeploymentCreate(running));
    } catch (err) {
        await prepared?.kill().catch(() => {
            // Still mark the deployment as failed if sandbox cleanup fails.
        });
        await markFunctionDeploymentFailed({
            environmentId: environment.id,
            id: deployment.id,
            error: toFunctionDeploymentError(err)
        });
        sendStepError({ res, error: err, ...(err instanceof FunctionError ? {} : { status: 500 }) });
    }
});

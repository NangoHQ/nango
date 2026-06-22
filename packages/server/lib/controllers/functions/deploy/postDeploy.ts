import {
    createFunctionDeployment,
    createSucceededFunctionDeployment,
    FunctionError,
    markFunctionDeploymentFailed,
    markFunctionDeploymentRunning,
    prepareAsyncDeploy,
    toFunctionDeploymentCreate
} from '@nangohq/sandbox';
import { configService, getSyncConfigRaw } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { deployIntegrationTemplate } from '../../v1/flows/preBuilt/helpers.js';
import { sendStepError } from '../errors.js';
import { getFunctionCallbackBaseUrl } from '../helpers.js';
import { functionDeploymentBodySchema } from '../validation.js';
import { createDeploySandboxApiKey, requireCustomerKeyId, toFunctionDeploymentError } from './helpers.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { DBSyncConfig, FunctionDeploymentCodeBody, FunctionDeploymentTemplateBody, PostFunctionDeployment } from '@nangohq/types';
import type { Response } from 'express';

type DeploymentResponse = Response<PostFunctionDeployment['Reply'], Required<RequestLocals>>;

function isProtectedExistingFunction(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null): boolean {
    return Boolean(existingSyncConfig && existingSyncConfig.source !== 'standalone');
}

function shouldAllowDestructiveDeploy(existingSyncConfig: Pick<DBSyncConfig, 'source'> | null, allowDestructive: boolean): boolean {
    return Boolean(allowDestructive && existingSyncConfig?.source === 'standalone');
}

/**
 * Deploy a catalog template onto an integration. Runs synchronously but records a deployment async job in a
 * terminal 'success' state, so the 202 response and `GET /functions/deployments/:id` mirrors the asynchronous
 * code-deploy path.
 */
async function handleDeployTemplate(res: DeploymentResponse, body: FunctionDeploymentTemplateBody): Promise<void> {
    const { environment, account, plan, user } = res.locals;

    const outcome = await deployIntegrationTemplate({
        environment,
        account,
        plan,
        user,
        providerConfigKey: body.integration_id,
        name: body.template,
        type: body.function_type
    });

    if (!outcome.ok) {
        switch (outcome.reason) {
            case 'integration_not_found':
                res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
                return;
            case 'template_not_found':
                res.status(404).send({ error: { code: 'template_not_found', message: `No template named '${body.template}' exists for this integration` } });
                return;
            case 'ambiguous_template':
                res.status(409).send({
                    error: {
                        code: 'ambiguous_function',
                        message: `'${body.template}' exists as both a sync and an action; specify 'function_type' to disambiguate`
                    }
                });
                return;
            case 'plan_limit':
                res.status(400).send({ error: { code: 'plan_limit', message: "Can't enable more functions, upgrade or extend your trial period" } });
                return;
            case 'template_already_deployed':
                res.status(409).send({ error: { code: 'template_already_deployed', message: `'${body.template}' is already deployed on this integration` } });
                return;
            case 'non_runnable_type':
                report(new Error(`Template '${body.template}' resolved to a non-runnable type and cannot be deployed as a function`));
                res.status(500).send({ error: { code: 'server_error', message: `Template '${body.template}' cannot be deployed as a function` } });
                return;
            default:
                if (outcome.cause) {
                    report(outcome.cause);
                }
                res.status(500).send({ error: { code: 'deployment_error', message: 'Failed to deploy the template' } });
                return;
        }
    }

    const { result, type } = outcome;
    const version = result.version ?? '';
    const deployment = await createSucceededFunctionDeployment({
        environmentId: environment.id,
        request: {
            type: 'template',
            integration_id: body.integration_id,
            template: body.template,
            function_name: result.name,
            function_type: type
        },
        output: `Successfully deployed the functions:\n- ${result.name}@${version}`,
        deployedFunctions: [{ name: result.name, version }]
    });
    if (deployment.isErr()) {
        report(deployment.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Template was deployed but its deployment record could not be created' } });
        return;
    }

    res.status(202).send(deployment.value);
}

/**
 * Deploy submitted TypeScript source code. Runs asynchronously in a sandbox: returns a waiting/running
 * deployment status
 */
async function handleDeployCode(res: DeploymentResponse, body: FunctionDeploymentCodeBody): Promise<void> {
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

    const allowDestructiveDeploy = shouldAllowDestructiveDeploy(existingSyncConfig, body.allow_destructive ?? false);
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
    if (body.type === 'template') {
        await handleDeployTemplate(res, body);
        return;
    }

    await handleDeployCode(res, body);
});

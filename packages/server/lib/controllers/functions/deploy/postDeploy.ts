import db from '@nangohq/database';
import { configService, getSyncConfigRaw, sandboxApiKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { parseDeploySuccessOutput } from '../../../services/remote-function/command-output.js';
import { invokeDeploy } from '../../../services/remote-function/deploy-client.js';
import { RemoteFunctionError, sendStepError } from '../../../services/remote-function/helpers.js';
import { getRemoteFunctionNangoHost, remoteFunctionDeploySandboxTimeoutMs } from '../../../services/remote-function/runtime.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { functionDeploymentBodySchema, remoteFunctionDeployBodySchema } from '../validation.js';

import type { PostFunctionDeployment, PostRemoteFunctionDeploy } from '@nangohq/types';
import type { Response } from 'express';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;

async function createDeploySandboxApiKey(res: Response, environmentId: number): Promise<string | null> {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['apiKeyId']) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Sandbox tokens can only be issued from a customer API key' } });
        return null;
    }

    const sandboxApiKey = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId: res.locals['apiKeyId'],
        environmentId,
        purpose: 'deploy',
        expiresAt: new Date(Date.now() + remoteFunctionDeploySandboxTimeoutMs + sandboxApiKeyTimeoutBufferMs)
    });
    if (sandboxApiKey.isErr()) {
        sendStepError({ res, status: 500, error: sandboxApiKey.error });
        return null;
    }

    return sandboxApiKey.value;
}

export const postRemoteFunctionDeploy = asyncWrapper<PostRemoteFunctionDeploy>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = remoteFunctionDeployBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;

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

    if (existingSyncConfig && existingSyncConfig.source !== 'standalone') {
        res.status(400).send({
            error: {
                code: 'invalid_request',
                message: `Cannot overwrite existing function '${body.function_name}'`
            }
        });
        return;
    }

    const sandboxApiKey = await createDeploySandboxApiKey(res, environment.id);
    if (!sandboxApiKey) {
        return;
    }

    try {
        const result = await invokeDeploy({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            nango_secret_key: sandboxApiKey,
            nango_host: getRemoteFunctionNangoHost(),
            allow_destructive: true
        });
        const output = parseDeploySuccessOutput(result.output);

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            deployed: output.deployed,
            deployed_functions: output.deployedFunctions,
            output: output.output
        });
    } catch (err) {
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});

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

    if (existingSyncConfig && existingSyncConfig.source !== 'standalone' && !body.allow_destructive) {
        res.status(400).send({
            error: {
                code: 'invalid_request',
                message: `Cannot overwrite existing function '${body.function_name}'`
            }
        });
        return;
    }

    const sandboxApiKey = await createDeploySandboxApiKey(res, environment.id);
    if (!sandboxApiKey) {
        return;
    }

    try {
        const result = await invokeDeploy({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            nango_secret_key: sandboxApiKey,
            nango_host: getRemoteFunctionNangoHost(),
            ...(body.version ? { version: body.version } : {}),
            ...(body.allow_destructive ? { allow_destructive: true } : {})
        });
        const output = parseDeploySuccessOutput(result.output);

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            deployed: output.deployed,
            deployed_functions: output.deployedFunctions,
            output: output.output
        });
    } catch (err) {
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});

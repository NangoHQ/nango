import {
    RemoteFunctionError,
    createFunctionDryrun,
    getRemoteFunctionNangoHost,
    markFunctionDryrunFailed,
    markFunctionDryrunRunning,
    prepareAsyncDryrun,
    toFunctionDryrunCreate
} from '@nangohq/sandbox';
import { configService, connectionService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { functionDryrunBodySchema } from '../validation.js';
import { createDryrunSandboxApiKey, defaultFunctionName, requireCustomerKeyId, toFunctionDryrunError } from './helpers.js';

import type { PostFunctionDryrun } from '@nangohq/types';

export const postFunctionDryrun = asyncWrapper<PostFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = functionDryrunBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;
    const parentCustomerKeyId = requireCustomerKeyId(res, 'Function dryruns can only be started from a customer API key');
    if (!parentCustomerKeyId) {
        return;
    }

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig) {
        res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
        return;
    }

    const connectionResult = await connectionService.getConnection(body.connection_id, body.integration_id, environment.id);
    if (!connectionResult.success || !connectionResult.response) {
        sendStepError({
            res,
            status: 404,
            error: { type: 'connection_not_found', message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'` }
        });
        return;
    }

    const dryrunResult = await createFunctionDryrun({
        environmentId: environment.id,
        request: {
            integration_id: body.integration_id,
            function_name: defaultFunctionName,
            function_type: body.function_type,
            code: body.code,
            connection_id: body.connection_id,
            ...(body.input !== undefined ? { input: body.input } : {}),
            ...(body.metadata ? { metadata: body.metadata } : {}),
            ...(body.checkpoint ? { checkpoint: body.checkpoint } : {}),
            ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
        }
    });
    if (dryrunResult.isErr()) {
        sendStepError({ res, status: 500, error: dryrunResult.error });
        return;
    }

    const dryrun = dryrunResult.value;
    let prepared: Awaited<ReturnType<typeof prepareAsyncDryrun>> | null = null;
    try {
        const nangoHost = getRemoteFunctionNangoHost();
        const sandboxApiKey = await createDryrunSandboxApiKey(parentCustomerKeyId, environment.id, dryrun.id);
        if (sandboxApiKey.isErr()) {
            throw sandboxApiKey.error;
        }

        const callbackUrl = new URL(`/functions/dryruns/${dryrun.id}/result`, nangoHost).toString();
        prepared = await prepareAsyncDryrun({
            integration_id: body.integration_id,
            function_name: defaultFunctionName,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            connection_id: body.connection_id,
            nango_secret_key: sandboxApiKey.value,
            nango_host: nangoHost,
            dryrun_id: dryrun.id,
            callback_url: callbackUrl,
            ...(body.input !== undefined ? { input: body.input } : {}),
            ...(body.metadata ? { metadata: body.metadata } : {}),
            ...(body.checkpoint ? { checkpoint: body.checkpoint } : {}),
            ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
        });

        const running = await markFunctionDryrunRunning({
            environmentId: environment.id,
            id: dryrun.id,
            sandboxId: prepared.sandboxId,
            startedAt: prepared.startedAt,
            executionTimeoutAt: prepared.executionTimeoutAt
        });
        if (!running) {
            await prepared.kill();
            throw new Error(`Failed to mark function dryrun '${dryrun.id}' as running`);
        }

        await prepared.start();

        res.status(202).send(toFunctionDryrunCreate(running));
    } catch (err) {
        await prepared?.kill().catch(() => {
            // Still mark the dryrun as failed if sandbox cleanup fails.
        });
        await markFunctionDryrunFailed({
            environmentId: environment.id,
            id: dryrun.id,
            error: toFunctionDryrunError(err)
        });
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});

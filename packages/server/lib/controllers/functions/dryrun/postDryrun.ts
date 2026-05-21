import db from '@nangohq/database';
import {
    RemoteFunctionError,
    createFunctionDryrun,
    getFunctionDryrun as getStoredFunctionDryrun,
    getFunctionDryrunRow,
    getRemoteFunctionNangoHost,
    invokeDryrun,
    markFunctionDryrunFailed,
    markFunctionDryrunRunning,
    markFunctionDryrunSucceeded,
    parseDryrunSuccessOutput,
    prepareAsyncDryrun,
    remoteFunctionDryrunSandboxTimeoutMs,
    sandboxApiKeyService,
    toFunctionDryrunCreate
} from '@nangohq/sandbox';
import { configService, connectionService } from '@nangohq/shared';
import { requireEmptyQuery, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { functionDryrunBodySchema, functionDryrunParamsSchema, functionDryrunResultBodySchema, remoteFunctionDryrunBodySchema } from '../validation.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { FunctionErrorCode, GetFunctionDryrun, PostFunctionDryrun, PostFunctionDryrunResult, PostRemoteFunctionDryrun } from '@nangohq/types';
import type { Response } from 'express';

const defaultFunctionName = 'function';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;

const functionErrorCodes = new Set<string>([
    'invalid_request',
    'integration_not_found',
    'compilation_error',
    'dryrun_error',
    'deployment_error',
    'connection_not_found',
    'dryrun_not_found',
    'function_disabled',
    'execution_environment_unavailable',
    'timeout',
    'validation_error'
] satisfies FunctionErrorCode[]);

type RemoteDryrunResponse = Response<PostRemoteFunctionDryrun['Reply'], Required<RequestLocals>>;
type FunctionDryrunResponse = Response<PostFunctionDryrun['Reply'], Required<RequestLocals>>;

async function createDryrunSandboxApiKey(parentApiKeyId: number, environmentId: number) {
    return await sandboxApiKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId,
        environmentId,
        purpose: 'dryrun',
        expiresAt: new Date(Date.now() + remoteFunctionDryrunSandboxTimeoutMs + sandboxApiKeyTimeoutBufferMs)
    });
}

function getRemoteParentCustomerKeyId(res: RemoteDryrunResponse): number | null {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['apiKeyId']) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Sandbox tokens can only be issued from a customer API key' } });
        return null;
    }

    return res.locals['apiKeyId'];
}

function getFunctionParentCustomerKeyId(res: FunctionDryrunResponse): number | null {
    if (res.locals['apiKeyAuthSource'] !== 'customer_key' || !res.locals['apiKeyId']) {
        res.status(403).send({ error: { code: 'forbidden', message: 'Function dryruns can only be started from a customer API key' } });
        return null;
    }

    return res.locals['apiKeyId'];
}

export const postRemoteFunctionDryrun = asyncWrapper<PostRemoteFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = remoteFunctionDryrunBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;

    const connectionResult = await connectionService.getConnection(body.connection_id, body.integration_id, environment.id);
    if (!connectionResult.success || !connectionResult.response) {
        sendStepError({
            res,
            status: 404,
            error: { type: 'connection_not_found', message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'` }
        });
        return;
    }

    const parentCustomerKeyId = getRemoteParentCustomerKeyId(res);
    if (!parentCustomerKeyId) {
        return;
    }

    const sandboxApiKey = await createDryrunSandboxApiKey(parentCustomerKeyId, environment.id);
    if (sandboxApiKey.isErr()) {
        sendStepError({ res, status: 500, error: sandboxApiKey.error });
        return;
    }

    const startedAt = new Date();

    try {
        const result = await invokeDryrun({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            connection_id: body.connection_id,
            nango_secret_key: sandboxApiKey.value,
            nango_host: getRemoteFunctionNangoHost(),
            ...(body.input !== undefined ? { input: body.input } : {}),
            ...(body.metadata ? { metadata: body.metadata } : {}),
            ...(body.checkpoint ? { checkpoint: body.checkpoint } : {}),
            ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
        });

        const durationMs = Date.now() - startedAt.getTime();
        const dryrunOutput = parseDryrunSuccessOutput(result.output);

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            execution_timeout_at: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
            duration_ms: durationMs,
            ...(dryrunOutput.hasResult ? { result: dryrunOutput.result } : {})
        });
    } catch (err) {
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});

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
    const parentCustomerKeyId = getFunctionParentCustomerKeyId(res);
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

    const sandboxApiKey = await createDryrunSandboxApiKey(parentCustomerKeyId, environment.id);
    if (sandboxApiKey.isErr()) {
        sendStepError({ res, status: 500, error: sandboxApiKey.error });
        return;
    }

    const dryrun = await createFunctionDryrun({
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

    let prepared: Awaited<ReturnType<typeof prepareAsyncDryrun>> | null = null;
    try {
        const callbackUrl = new URL(`/functions/dryruns/${dryrun.id}/result`, getRemoteFunctionNangoHost()).toString();
        prepared = await prepareAsyncDryrun({
            integration_id: body.integration_id,
            function_name: defaultFunctionName,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            connection_id: body.connection_id,
            nango_secret_key: sandboxApiKey.value,
            nango_host: getRemoteFunctionNangoHost(),
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
        await prepared?.kill();
        await markFunctionDryrunFailed({
            environmentId: environment.id,
            id: dryrun.id,
            error: toFunctionDryrunError(err)
        });
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});

export const getFunctionDryrun = asyncWrapper<GetFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDryrunParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const dryrun = await getStoredFunctionDryrun({ environmentId: environment.id, id: valParams.data.id });
    if (!dryrun) {
        res.status(404).send({ error: { code: 'dryrun_not_found', message: `Dryrun '${valParams.data.id}' was not found` } });
        return;
    }

    res.status(200).send(dryrun);
});

export const postFunctionDryrunResult = asyncWrapper<PostFunctionDryrunResult>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDryrunParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valBody = functionDryrunResultBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const current = await getFunctionDryrunRow({ environmentId: environment.id, id: valParams.data.id });
    if (!current) {
        res.status(404).send({ error: { code: 'dryrun_not_found', message: `Dryrun '${valParams.data.id}' was not found` } });
        return;
    }

    if (current.status === 'succeeded' || current.status === 'failed') {
        res.status(200).send({ ok: true });
        return;
    }

    const body = valBody.data;
    if (body.status === 'succeeded') {
        const output = parseDryrunSuccessOutput(body.output);
        await markFunctionDryrunSucceeded({
            environmentId: environment.id,
            id: current.id,
            output: output.output,
            result: output.result,
            hasResult: output.hasResult,
            durationMs: body.duration_ms
        });
    } else {
        await markFunctionDryrunFailed({
            environmentId: environment.id,
            id: current.id,
            output: body.output,
            durationMs: body.duration_ms,
            error: {
                code: normalizeFunctionErrorCode(body.error.code),
                message: body.error.message,
                ...(body.error.payload !== undefined ? { payload: body.error.payload } : {})
            }
        });
    }

    res.status(200).send({ ok: true });
});

function normalizeFunctionErrorCode(code: string | undefined): FunctionErrorCode {
    if (code && functionErrorCodes.has(code)) {
        return code as FunctionErrorCode;
    }

    return 'dryrun_error';
}

function toFunctionDryrunError(err: unknown): { code: FunctionErrorCode; message: string; payload?: unknown } {
    if (err instanceof RemoteFunctionError) {
        return {
            code: err.code,
            message: err.message,
            ...(err.payload !== undefined ? { payload: err.payload } : {})
        };
    }

    return {
        code: 'dryrun_error',
        message: stringifyError(err)
    };
}

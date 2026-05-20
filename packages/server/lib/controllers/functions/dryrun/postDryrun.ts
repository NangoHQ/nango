import { z } from 'zod';

import db from '@nangohq/database';
import {
    configService,
    connectionService,
    createFunctionDryrun,
    customerKeyService,
    getFunctionDryrun as getStoredFunctionDryrun,
    getFunctionDryrunRow,
    internalFunctionDryrunActionName,
    markFunctionDryrunFailed,
    markFunctionDryrunSucceeded
} from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { parseDryrunSuccessOutput } from '../../../services/remote-function/command-output.js';
import { invokeDryrun } from '../../../services/remote-function/dryrun-client.js';
import { RemoteFunctionError, sendStepError } from '../../../services/remote-function/helpers.js';
import { getRemoteFunctionNangoHost, remoteFunctionDryrunSandboxTimeoutMs } from '../../../services/remote-function/runtime.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestratorClient } from '../../../utils/utils.js';
import { functionDryrunBodySchema, remoteFunctionDryrunBodySchema } from '../validation.js';

import type { RequestLocals } from '../../../utils/express.js';
import type { Endpoint, FunctionErrorCode, GetFunctionDryrun, PostFunctionDryrun, PostRemoteFunctionDryrun } from '@nangohq/types';
import type { Response } from 'express';

const defaultFunctionName = 'function';

const sandboxApiKeyTimeoutBufferMs = 60 * 1000;
const functionDryrunGroupMaxConcurrency = 0;

const dryrunParamsSchema = z
    .object({
        id: z.string().uuid()
    })
    .strict();

const functionErrorCodes = new Set<string>([
    'invalid_request',
    'integration_not_found',
    'compilation_error',
    'dryrun_error',
    'deployment_error',
    'connection_not_found',
    'dryrun_not_found',
    'function_disabled',
    'timeout',
    'validation_error'
] satisfies FunctionErrorCode[]);

const functionDryrunResultBodySchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('succeeded'),
            output: z.string(),
            duration_ms: z.number().int().nonnegative().optional()
        })
        .strict(),
    z
        .object({
            status: z.literal('failed'),
            output: z.string().optional(),
            duration_ms: z.number().int().nonnegative().optional(),
            error: z
                .object({
                    code: z.string().optional(),
                    message: z.string(),
                    payload: z.unknown().optional()
                })
                .strict()
        })
        .strict()
]);

type FunctionDryrunResultBody = z.infer<typeof functionDryrunResultBodySchema>;

type PostFunctionDryrunResult = Endpoint<{
    Method: 'POST';
    Path: '/functions/dryruns/:id/result';
    Params: { id: string };
    Body: FunctionDryrunResultBody;
    Error: { error: { code: FunctionErrorCode; message: string; payload?: unknown } };
    Success: { ok: true };
}>;

type RemoteDryrunResponse = Response<PostRemoteFunctionDryrun['Reply'], Required<RequestLocals>>;
type FunctionDryrunResponse = Response<PostFunctionDryrun['Reply'], Required<RequestLocals>>;

async function createDryrunSandboxApiKey(parentApiKeyId: number, environmentId: number) {
    return await customerKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId,
        environmentId,
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

    const schedule = await getOrchestratorClient().executeActionAsync({
        name: `function-dryrun:environment:${environment.id}:dryrun:${dryrun.id}`,
        group: { key: `function-dryrun:environment:${environment.id}`, maxConcurrency: functionDryrunGroupMaxConcurrency },
        retry: { count: 0, max: 0 },
        ownerKey: `environment:${environment.id}`,
        args: {
            actionName: internalFunctionDryrunActionName,
            connection: {
                id: connectionResult.response.id,
                connection_id: connectionResult.response.connection_id,
                provider_config_key: connectionResult.response.provider_config_key,
                environment_id: connectionResult.response.environment_id
            },
            activityLogId: dryrun.id,
            input: {
                dryrunId: dryrun.id,
                parentCustomerKeyId
            },
            async: true
        }
    });

    if (schedule.isErr()) {
        await markFunctionDryrunFailed({
            environmentId: environment.id,
            id: dryrun.id,
            error: {
                code: 'dryrun_error',
                message: schedule.error.message
            }
        });
        sendStepError({ res, status: 500, error: schedule.error });
        return;
    }

    res.status(202).send(dryrun);
});

export const getFunctionDryrun = asyncWrapper<GetFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = dryrunParamsSchema.safeParse(req.params);
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

    const valParams = dryrunParamsSchema.safeParse(req.params);
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
            statuses: ['running'],
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

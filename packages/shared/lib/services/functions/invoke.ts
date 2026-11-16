import tracer from 'dd-trace';

import db from '@nangohq/database';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { Err, Ok, truncateJson } from '@nangohq/utils';

import { envs } from '../../env.js';
import connectionService from '../connection.service.js';
import * as functionLookupService from './lookup/index.js';
import { validateFunctionInput } from './models/validate.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { ResolvedFunction } from './lookup/service.js';
import type { FunctionInputValidationError } from './models/validate.js';
import type { LogContextOrigin } from '@nangohq/logs';
import type {
    AsyncFunctionResponse,
    ConnectionJobs,
    DBEnvironment,
    DBFunctionConfigVersion,
    DBTeam,
    FunctionInvocationErrorCode,
    FunctionInvocationType,
    FunctionTrigger,
    OperationActor,
    OperationFunction,
    OperationTool
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export class FunctionInvokeError extends Error {
    readonly code: FunctionInvocationErrorCode;
    readonly errors: FunctionInputValidationError['validationErrors'];

    constructor({
        message,
        code,
        cause,
        errors
    }: {
        message: string;
        code: FunctionInvocationErrorCode;
        cause?: unknown;
        errors?: FunctionInputValidationError['validationErrors'];
    }) {
        super(message, { cause });
        this.name = 'FunctionInvokeError';
        this.code = code;
        this.errors = errors ?? [];
        Error.captureStackTrace?.(this, FunctionInvokeError);
    }
}

export type FunctionInvocationResult = AsyncFunctionResponse | { data: JsonValue };

export interface FunctionInvocation {
    /** Created once the invocation is known to be valid, so callers can enrich the operation afterwards. */
    logCtx: LogContextOrigin | undefined;
    result: Result<FunctionInvocationResult, FunctionInvokeError>;
}

export async function invokeFunction({
    account,
    environment,
    connectionId,
    functionUuid,
    input,
    request,
    invocationType,
    options,
    orchestrator,
    actor,
    logMeta,
    operation = { type: 'function', action: 'invoke' }
}: {
    account: DBTeam;
    environment: DBEnvironment;
    connectionId: string;
    functionUuid: string;
    input?: unknown | undefined;
    request: Omit<Extract<FunctionTrigger, { kind: 'http' }>['request'], 'body'>;
    invocationType: FunctionInvocationType;
    options?: Record<string, unknown> | undefined;
    orchestrator: Orchestrator;
    actor?: OperationActor | undefined;
    /** Added to the operation's meta, next to the input. */
    logMeta?: Record<string, unknown> | undefined;
    operation?: OperationFunction | OperationTool;
}): Promise<FunctionInvocation> {
    let logCtx: LogContextOrigin | undefined;
    const result = await tracer.trace('nango.function.invocation', async (span): Promise<Result<FunctionInvocationResult, FunctionInvokeError>> => {
        span.addTags({
            accountId: account.id,
            environmentId: environment.id,
            connectionId,
            functionUuid,
            invocationType
        });

        const functionRes = await functionLookupService.resolveFunctionByUuid({ environmentId: environment.id, functionUuid });
        if (functionRes.isErr()) {
            return Err(new FunctionInvokeError({ code: 'server_error', message: 'Failed to find function', cause: functionRes.error }));
        }
        const fn = functionRes.value;
        if (!fn) {
            return Err(new FunctionInvokeError({ code: 'function_not_found', message: `Function '${functionUuid}' was not found` }));
        }
        if (!fn.enabled) {
            return Err(new FunctionInvokeError({ code: 'function_disabled', message: `Function '${functionUuid}' is disabled` }));
        }
        const currentVersion = fn.definition;
        const context = await resolveFunctionConnection({ fn, environmentId: environment.id, connectionId });
        if (context.isErr()) {
            return Err(context.error);
        }
        const { integration, connection } = context.value;
        const integrationId = integration.unique_key;
        span.addTags({ integrationId });

        const canInvokeRes = canInvoke(currentVersion, invocationType);
        if (canInvokeRes.isErr()) {
            return Err(canInvokeRes.error);
        }

        const validation = validateFunctionInput(currentVersion, input);

        if (validation.isErr()) {
            return Err(
                new FunctionInvokeError({
                    code: 'validation_error',
                    message: validation.error.message,
                    errors: validation.error.validationErrors
                })
            );
        }

        const trigger = buildInvokeTrigger({
            version: currentVersion,
            input: validation.value,
            request,
            connection: {
                connectionId: connection.connection_id,
                integrationId
            }
        });
        if (trigger.isErr()) {
            return Err(trigger.error);
        }
        const timeoutMs = executionTimeoutMs(invocationType);

        logCtx = await logContextGetter.create(
            { operation, expiresAt: new Date(Date.now() + timeoutMs).toISOString(), actor },
            {
                account,
                environment,
                integration: { id: integration.id, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { ...(fn.kind === 'deployed' && { id: fn.definition.id }), name: fn.name },
                meta: {
                    ...logMeta,
                    invocation_type: invocationType,
                    ...(options ? { options } : {}),
                    ...(input !== undefined ? truncateJson({ input: envs.NANGO_LOG_FUNCTION_INPUT ? input : 'REDACTED' }) : {})
                }
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        // `perConnection: 1` serializes concurrent invocations of the same function for a connection; 'max' is unbounded
        const maxConcurrency = getFunctionMaxConcurrency(currentVersion);

        const invocation = await orchestrator.invokeFunction({
            environment,
            connection,
            functionUuid: fn.uuid,
            trigger: trigger.value,
            async: invocationType === 'no_wait',
            retryMax: 0,
            maxConcurrency,
            logCtx
        });

        if (invocation.isErr()) {
            void logCtx.error(invocation.error.message, { error: invocation.error });
            void logCtx.failed();
            return Err(
                new FunctionInvokeError({
                    code: 'function_failed',
                    message: invocation.error.message,
                    cause: invocation.error
                })
            );
        }

        if (invocationType === 'wait') {
            void logCtx.success();
        }
        return Ok(invocation.value);
    });
    return { logCtx, result };
}

export async function resolveFunctionConnection({
    fn,
    environmentId,
    connectionId
}: {
    fn: ResolvedFunction;
    environmentId: number;
    connectionId: string;
}): Promise<Result<{ connection: ConnectionJobs; integration: { id: number; unique_key: string; provider: string } }, FunctionInvokeError>> {
    const notFound = () => new FunctionInvokeError({ code: 'connection_not_found', message: `Connection '${connectionId}' was not found` });
    try {
        if (fn.kind === 'deployed') {
            const connection = await connectionService.getConnection(connectionId, fn.integration.unique_key, environmentId);
            return connection.response ? Ok({ connection: connection.response, integration: fn.integration }) : Err(notFound());
        }
        const connections = await connectionService.search(db.knex, { environmentId, filter: { connectionId, provider: fn.definition.provider }, limit: 2 });
        if (connections.isErr()) {
            return Err(new FunctionInvokeError({ code: 'server_error', message: 'Failed to find connection', cause: connections.error }));
        }
        const [connection, other] = connections.value;
        if (!connection) {
            return Err(notFound());
        }
        if (other) {
            return Err(new FunctionInvokeError({ code: 'invalid_invocation', message: `Connection '${connectionId}' is ambiguous across integrations` }));
        }
        return Ok({ connection, integration: { id: connection.config_id, unique_key: connection.provider_config_key, provider: fn.definition.provider } });
    } catch (err) {
        return Err(new FunctionInvokeError({ code: 'server_error', message: 'Failed to find connection', cause: err }));
    }
}

/** Convert a function's per-connection concurrency setting to the orchestrator convention (0 means unbounded). */
export function getFunctionMaxConcurrency(version: Pick<DBFunctionConfigVersion, 'limits'>): number {
    return version.limits?.concurrency?.perConnection === 1 ? 1 : 0;
}

function buildInvokeTrigger({
    version,
    input,
    request,
    connection
}: {
    version: Pick<DBFunctionConfigVersion, 'trigger'>;
    input: JsonValue;
    request: Omit<Extract<FunctionTrigger, { kind: 'http' }>['request'], 'body'>;
    connection: NonNullable<Extract<FunctionTrigger, { kind: 'invoke' }>['connection']>;
}): Result<FunctionTrigger, FunctionInvokeError> {
    switch (version.trigger.kind) {
        case 'http': {
            return Ok({
                kind: 'http',
                input,
                request: { ...request, body: input },
                connection
            });
        }
        case 'schedule':
            return Ok({ kind: 'schedule', input: null, connection });
        case 'event':
            return Err(new FunctionInvokeError({ code: 'invalid_invocation', message: 'Event-triggered functions cannot be invoked directly' }));
        case 'none':
            return Ok({ kind: 'invoke', input, connection });
    }
}

function executionTimeoutMs(invocationType: FunctionInvocationType): number {
    return invocationType === 'wait'
        ? 2 * 60 * 1000 // 2 minutes for synchronous invocations
        : 24 * 60 * 60 * 1000; // 24 hours for asynchronous invocations
}

function canInvoke(version: Pick<DBFunctionConfigVersion, 'trigger'>, invocationType: FunctionInvocationType): Result<void, FunctionInvokeError> {
    const reject = (message: string): Result<void, FunctionInvokeError> => Err(new FunctionInvokeError({ code: 'invalid_invocation', message }));
    const allowOnly = (allowed: FunctionInvocationType[]): Result<void, FunctionInvokeError> =>
        allowed.includes(invocationType) ? Ok(undefined) : reject(`Function is not invokable with '${invocationType}'`);

    switch (version.trigger.kind) {
        case 'http':
            return allowOnly(['wait', 'no_wait']);
        case 'schedule':
            return allowOnly(['no_wait']);
        case 'event':
            return reject('Event-triggered functions cannot be invoked directly');
        case 'none':
            return reject('Functions with no trigger cannot be invoked directly');
    }
}

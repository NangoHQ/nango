import tracer from 'dd-trace';

import db from '@nangohq/database';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { Err, truncateJson } from '@nangohq/utils';

import connectionService from '../connection.service.js';
import * as functionConfigService from './models/functions.js';
import { validateFunctionInput } from './models/validate.js';

import type { FunctionInputValidationError } from './models/validate.js';
import type { DBEnvironment, DBFunctionConfigVersion, DBTeam, FunctionInvocationErrorCode, FunctionInvocationType } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type ValidationErrors = FunctionInputValidationError['validationErrors'];

export class FunctionInvokeError extends Error {
    readonly code: FunctionInvocationErrorCode;
    readonly errors: ValidationErrors;

    constructor({ message, code, cause, errors }: { message: string; code: FunctionInvocationErrorCode; cause?: unknown; errors?: ValidationErrors }) {
        super(message, { cause });
        this.name = 'FunctionInvokeError';
        this.code = code;
        this.errors = errors ?? [];
        Error.captureStackTrace?.(this, FunctionInvokeError);
    }
}

export async function invokeFunction({
    account,
    environment,
    integrationId,
    connectionId,
    functionName,
    input,
    invocationType,
    options
}: {
    account: DBTeam;
    environment: DBEnvironment;
    integrationId: string;
    connectionId: string;
    functionName: string;
    input?: unknown | undefined;
    invocationType: FunctionInvocationType;
    options?: Record<string, unknown> | undefined;
}): Promise<Result<void, FunctionInvokeError>> {
    return tracer.trace('nango.function.invocation', async (span) => {
        span.addTags({
            accountId: account.id,
            environmentId: environment.id,
            integrationId,
            connectionId,
            functionName,
            invocationType
        });

        const connectionRes = await connectionService.getConnection(connectionId, integrationId, environment.id);

        if (!connectionRes.success) {
            return Err(
                new FunctionInvokeError({
                    code: 'connection_not_found',
                    message: `Connection '${connectionId}' was not found for integration '${integrationId}'`
                })
            );
        }

        const functionRes = await functionConfigService.search(db.knex, {
            environmentId: environment.id,
            filter: { integrationKey: integrationId, name: functionName }
        });

        if (functionRes.isErr()) {
            return Err(
                new FunctionInvokeError({
                    code: 'server_error',
                    message: 'Failed to find function',
                    cause: functionRes.error
                })
            );
        }

        if (functionRes.value.length !== 1) {
            return Err(
                new FunctionInvokeError({
                    code: 'function_not_found',
                    message: `Function '${functionName}' was not found`
                })
            );
        }

        if (!functionRes.value[0]?.config.enabled) {
            return Err(
                new FunctionInvokeError({
                    code: 'function_disabled',
                    message: `Function '${functionName}' is disabled`
                })
            );
        }

        const { currentVersion, integration, config } = functionRes.value[0];

        if (!supportInvocation(currentVersion, invocationType)) {
            return Err(
                new FunctionInvokeError({
                    code: 'invalid_invocation',
                    message: `Function '${functionName}' is not invokable with ${invocationType}`
                })
            );
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

        const connection = connectionRes.response!;
        const timeoutMs = executionTimeoutMs(invocationType);

        const logCtx = await logContextGetter.create(
            { operation: { type: 'function', action: 'invoke' }, expiresAt: new Date(Date.now() + timeoutMs).toISOString() },
            {
                account,
                environment,
                integration: { id: integration.id, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: currentVersion.id, name: config.name },
                meta: {
                    invocation_type: invocationType,
                    ...(options ? { options } : {}),
                    ...(input ? { input: truncateJson(input) } : {})
                }
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        void logCtx.failed();
        return Err(
            new FunctionInvokeError({
                code: 'not_implemented',
                message: 'Function invocation is not implemented yet'
            })
        );
    });
}

function executionTimeoutMs(invocationType: FunctionInvocationType): number {
    return invocationType === 'wait'
        ? 2 * 60 * 1000 // 2 minutes for synchronous invocations
        : 24 * 60 * 60 * 1000; // 24 hours for asynchronous invocations
}

function supportInvocation(version: DBFunctionConfigVersion, invocationType: FunctionInvocationType): boolean {
    const supported: Record<DBFunctionConfigVersion['trigger']['kind'], FunctionInvocationType[]> = {
        http: ['wait', 'no_wait'],
        schedule: ['no_wait'],
        event: ['no_wait'],
        none: []
    };
    return supported[version.trigger.kind]?.includes(invocationType) ?? false;
}

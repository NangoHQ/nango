import { logger } from '../../logger.js';
import { handleActionError, handleActionSuccess } from '../action.js';
import { handleOnEventError, handleOnEventSuccess } from '../onEvent.js';
import { handleSyncError, handleSyncSuccess } from '../sync.js';
import { handleWebhookError, handleWebhookSuccess } from '../webhook.js';
import { toNangoError } from './utils/errors.js';

import type { CheckpointRange, FunctionRuntime, NangoProps, RunnerOutputError, TelemetryBag } from '@nangohq/types';
import type { JsonValue } from 'type-fest';

interface Payload {
    taskId: string;
    nangoProps: NangoProps;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
    checkpoints: CheckpointRange;
}
type SuccessPayload = Payload & { output: JsonValue };
type ErrorPayload = Payload & { error: RunnerOutputError };

export async function handle(payload: SuccessPayload | ErrorPayload): Promise<void> {
    if ('error' in payload) {
        await handleError(payload);
    } else {
        await handleSuccess(payload);
    }
}

async function handleSuccess({ taskId, nangoProps, output, telemetryBag, functionRuntime, checkpoints }: SuccessPayload): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'action':
            await handleActionSuccess({ taskId, nangoProps, output, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'sync':
            await handleSyncSuccess({ taskId, nangoProps, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'webhook':
            await handleWebhookSuccess({ taskId, nangoProps, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'on-event':
            await handleOnEventSuccess({ taskId, nangoProps, telemetryBag, functionRuntime });
            break;
    }
}

async function handleError({ taskId, nangoProps, error, telemetryBag, functionRuntime, checkpoints }: ErrorPayload): Promise<void> {
    // If the function was aborted, we do nothing as the function's state has already been updated
    if (error.type === 'script_aborted') {
        logger.info(`Script was aborted. Ignoring output.`, {
            taskId,
            syncId: nangoProps.syncId,
            environmentId: nangoProps.environmentId,
            providerConfigKey: nangoProps.providerConfigKey,
            connectionId: nangoProps.connectionId
        });
        return;
    }

    // if sync was interrupted gracefully, we consider it a success
    if (nangoProps.scriptType === 'sync' && error.type === 'execution_interrupted') {
        await handleSyncSuccess({ taskId, nangoProps, telemetryBag, functionRuntime, checkpoints, interrupted: true });
        return;
    }

    const formattedError = toNangoError({
        err: error,
        defaultErrorType: `${nangoProps.scriptType}_script_failure`,
        scriptName: nangoProps.syncConfig.sync_name
    });

    switch (nangoProps.scriptType) {
        case 'action':
            await handleActionError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'sync':
            await handleSyncError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'webhook':
            await handleWebhookError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime, checkpoints });
            break;
        case 'on-event':
            await handleOnEventError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime });
            break;
    }
}

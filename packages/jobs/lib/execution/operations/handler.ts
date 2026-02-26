import { logger } from '../../logger.js';
import { handleActionError, handleActionSuccess } from '../action.js';
import { handleOnEventError, handleOnEventSuccess } from '../onEvent.js';
import { handleSyncError, handleSyncSuccess } from '../sync.js';
import { handleWebhookError, handleWebhookSuccess } from '../webhook.js';
import { toNangoError } from './utils/errors.js';

import type { FunctionRuntime, NangoProps, RunnerOutputError, TelemetryBag } from '@nangohq/types';
import type { JsonValue } from 'type-fest';

export async function handleSuccess({
    taskId,
    nangoProps,
    output,
    telemetryBag,
    functionRuntime
}: {
    taskId: string;
    nangoProps: NangoProps;
    output: JsonValue;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
}): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'action':
            await handleActionSuccess({ taskId, nangoProps, output, telemetryBag, functionRuntime });
            break;
        case 'sync':
            await handleSyncSuccess({ taskId, nangoProps, telemetryBag, functionRuntime });
            break;
        case 'webhook':
            await handleWebhookSuccess({ taskId, nangoProps, telemetryBag, functionRuntime });
            break;
        case 'on-event':
            await handleOnEventSuccess({ taskId, nangoProps, telemetryBag, functionRuntime });
            break;
    }
}

export async function handleError({
    taskId,
    nangoProps,
    error,
    telemetryBag,
    functionRuntime
}: {
    taskId: string;
    nangoProps: NangoProps;
    error: RunnerOutputError;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
}): Promise<void> {
    if (error.type === 'script_aborted') {
        // do nothing, the script was aborted and its state already updated
        logger.info(`Script was aborted. Ignoring output.`, {
            taskId,
            syncId: nangoProps.syncId,
            environmentId: nangoProps.environmentId,
            providerConfigKey: nangoProps.providerConfigKey,
            connectionId: nangoProps.connectionId
        });
        return;
    }

    const formattedError = toNangoError({
        err: error,
        defaultErrorType: `${nangoProps.scriptType}_script_failure`,
        scriptName: nangoProps.syncConfig.sync_name
    });

    switch (nangoProps.scriptType) {
        case 'action':
            await handleActionError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime });
            break;
        case 'sync':
            await handleSyncError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime });
            break;
        case 'webhook':
            await handleWebhookError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime });
            break;
        case 'on-event':
            await handleOnEventError({ taskId, nangoProps, error: formattedError, telemetryBag, functionRuntime });
            break;
    }
}

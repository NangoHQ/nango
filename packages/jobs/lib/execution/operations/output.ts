import { orchestratorClient } from '../../clients.js';
import type { JsonValue } from 'type-fest';
import { logger } from '../../logger.js';
import { NangoError } from '@nangohq/shared';
import { handleSyncError, handleSyncSuccess } from '../sync.js';
import { handleActionError, handleActionSuccess } from '../action.js';
import { handleWebhookError, handleWebhookSuccess } from '../webhook.js';
import { handleOnEventError, handleOnEventSuccess } from '../onEvent.js';
import type { ApiError, NangoProps, RunnerOutputError } from '@nangohq/types';
import type { ClientError } from '@nangohq/nango-orchestrator';
import { toNangoError } from './utils/errors.js';

async function setTaskSuccess({ taskId, output, nangoProps }: { taskId: string; output: JsonValue; nangoProps: NangoProps }): Promise<void> {
    const setSuccess = await orchestratorClient.succeed({ taskId, output: output });
    if (setSuccess.isErr()) {
        await handlePayloadTooBigError({ taskId, error: setSuccess.error, nangoProps });
        logger.error(`failed to set task ${taskId} as succeeded`, setSuccess.error);
    }
}

async function setTaskFailed({ taskId, error, nangoProps }: { taskId: string; error: NangoError; nangoProps: NangoProps }): Promise<void> {
    const setFailed = await orchestratorClient.failed({ taskId, error });
    if (setFailed.isErr()) {
        await handlePayloadTooBigError({ taskId, error: setFailed.error, nangoProps });
        logger.error(`failed to set task ${taskId} as failed`, setFailed.error);
    }
}

export async function handleSuccess({ taskId, nangoProps, output }: { taskId: string; nangoProps: NangoProps; output: JsonValue }): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'action':
            await setTaskSuccess({ taskId, output, nangoProps }); // Setting task as success for action as soon as possible
            await handleActionSuccess({ nangoProps });
            break;
        case 'sync':
            await handleSyncSuccess({ nangoProps });
            await setTaskSuccess({ taskId, output, nangoProps });
            break;
        case 'webhook':
            await handleWebhookSuccess({ nangoProps });
            await setTaskSuccess({ taskId, output, nangoProps });
            break;
        case 'on-event':
            await handleOnEventSuccess({ nangoProps });
            await setTaskSuccess({ taskId, output, nangoProps });
            break;
    }
}

export async function handleError({ taskId, nangoProps, error }: { taskId: string; nangoProps: NangoProps; error: RunnerOutputError }): Promise<void> {
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
            await setTaskFailed({ taskId, error: formattedError, nangoProps }); // Setting task as failed for action as soon as possible
            await handleActionError({ nangoProps, error: formattedError });
            break;
        case 'sync':
            await handleSyncError({ nangoProps, error: formattedError });
            await setTaskFailed({ taskId, error: formattedError, nangoProps });
            break;
        case 'webhook':
            await handleWebhookError({ nangoProps, error: formattedError });
            await setTaskFailed({ taskId, error: formattedError, nangoProps });
            break;
        case 'on-event':
            await handleOnEventError({ nangoProps, error: formattedError });
            await setTaskFailed({ taskId, error: formattedError, nangoProps });
            break;
    }
}

async function handlePayloadTooBigError({ taskId, error, nangoProps }: { taskId: string; error: ClientError; nangoProps: NangoProps }): Promise<void> {
    try {
        if (
            error.payload &&
            typeof error.payload === 'object' &&
            'response' in error.payload &&
            error.payload['response'] &&
            typeof error.payload['response'] === 'object'
        ) {
            const res = error.payload['response'] as unknown as ApiError<string>;
            if (res.error && res.error.code === 'payload_too_big') {
                await orchestratorClient.failed({ taskId, error: new NangoError('script_output_too_big', { syncId: nangoProps.syncId }) });
            }
        }
    } catch (err) {
        logger.error(`failed to handle payload too big error for task ${taskId}`, err);
    }
}

import { orchestratorClient } from '../../clients.js';
import type { JsonValue } from 'type-fest';
import { logger } from '../../logger.js';
import { NangoError, formatScriptError } from '@nangohq/shared';
import type { NangoProps } from '@nangohq/shared';
import { handleSyncError, handleSyncOutput } from '../sync.js';
import { handleActionError, handleActionOutput } from '../action.js';
import { handleWebhookError, handleWebhookOutput } from '../webhook.js';
import { handlePostConnectionError, handlePostConnectionOutput } from '../postConnection.js';
import type { ApiError } from '@nangohq/types';
import type { ClientError } from '@nangohq/nango-orchestrator';

export async function handleOutput({ taskId, nangoProps, output }: { taskId: string; nangoProps: NangoProps; output: JsonValue }): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'sync':
            await handleSyncOutput({ nangoProps });
            break;
        case 'action':
            await handleActionOutput({ nangoProps });
            break;
        case 'webhook':
            await handleWebhookOutput({ nangoProps });
            break;
        case 'post-connection-script':
            await handlePostConnectionOutput({ nangoProps });
            break;
    }
    const setSuccess = await orchestratorClient.succeed({ taskId, output: output });
    if (setSuccess.isErr()) {
        handlePayloadTooBigError({ taskId, error: setSuccess.error, nangoProps });
        logger.error(`failed to set task ${taskId} as succeeded`, setSuccess.error);
    }
}

export async function handleError({
    taskId,
    nangoProps,
    error
}: {
    taskId: string;
    nangoProps: NangoProps;
    error: {
        type: string;
        payload: Record<string, unknown>;
        status: number;
    };
}): Promise<void> {
    const { error: formattedError } = formatScriptError(error.payload, `${nangoProps.scriptType}_script_failure`, nangoProps.syncConfig.sync_name);
    switch (nangoProps.scriptType) {
        case 'sync':
            await handleSyncError({ nangoProps, error: formattedError });
            break;
        case 'action':
            await handleActionError({ nangoProps, error: formattedError });
            break;
        case 'webhook':
            await handleWebhookError({ nangoProps, error: formattedError });
            break;
        case 'post-connection-script':
            await handlePostConnectionError({ nangoProps, error: formattedError });
            break;
    }
    const setFailed = await orchestratorClient.failed({ taskId, error: formattedError });
    if (setFailed.isErr()) {
        handlePayloadTooBigError({ taskId, error: setFailed.error, nangoProps });
        logger.error(`failed to set task ${taskId} as failed`, setFailed.error);
    }
}

async function handlePayloadTooBigError({ taskId, error, nangoProps }: { taskId: string; error: ClientError; nangoProps: NangoProps }): Promise<void> {
    if (
        error.payload &&
        typeof error.payload === 'object' &&
        'response' in error.payload &&
        error.payload['response'] &&
        typeof error.payload['response'] === 'object'
    ) {
        const res = error.payload['response'] as unknown as ApiError<string>;
        if (res.error.code === 'payload_too_big') {
            await orchestratorClient.failed({ taskId, error: new NangoError('script_output_too_big', { syncId: nangoProps.syncId }) });
        }
    }
}

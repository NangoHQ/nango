import { handleSyncError, handleSyncOutput } from '../sync.js';
import { orchestratorClient } from '../../clients.js';
import type { JsonValue } from 'type-fest';
import { logger } from '../../logger.js';
import type { NangoProps } from '@nangohq/shared';

export async function handleOutput({ taskId, nangoProps, output }: { taskId: string; nangoProps: NangoProps; output: JsonValue }): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'sync':
            await handleSyncOutput({ nangoProps });
            break;
        case 'action':
            // TODO
            break;
        case 'webhook':
            // TODO
            break;
        case 'post-connection-script':
            // TODO
            break;
    }
    const setSuccess = await orchestratorClient.succeed({ taskId, output: output });
    if (setSuccess.isErr()) {
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
    error: { type: string; payload: Record<string, unknown>; status: number };
}): Promise<void> {
    switch (nangoProps.scriptType) {
        case 'sync':
            await handleSyncError({ nangoProps, error });
            break;
        case 'action':
            // TODO
            break;
        case 'webhook':
            // TODO
            break;
        case 'post-connection-script':
            // TODO
            break;
    }
    const e = new Error(`${nangoProps.scriptType} failed with error ${error}`);
    const setFailed = await orchestratorClient.failed({ taskId, error: e });
    if (setFailed.isErr()) {
        logger.error(`failed to set task ${taskId} as failed`, setFailed.error);
    }
}

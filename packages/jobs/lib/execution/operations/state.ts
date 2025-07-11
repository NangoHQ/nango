import { NangoError } from '@nangohq/shared';

import { orchestratorClient } from '../../clients.js';
import { logger } from '../../logger.js';

import type { ClientError, OrchestratorTask } from '@nangohq/nango-orchestrator';
import type { ApiError, Result } from '@nangohq/types';
import type { JsonValue } from 'type-fest';

export async function setTaskSuccess({ taskId, output }: { taskId: string; output: JsonValue }): Promise<Result<OrchestratorTask>> {
    const setSuccess = await orchestratorClient.succeed({ taskId, output: output });
    if (setSuccess.isErr()) {
        await handlePayloadTooBigError({ taskId, error: setSuccess.error });
        logger.error(`failed to set task ${taskId} as succeeded`, setSuccess.error);
    }
    return setSuccess;
}

export async function setTaskFailed({ taskId, error }: { taskId: string; error: NangoError }): Promise<Result<OrchestratorTask>> {
    const setFailed = await orchestratorClient.failed({ taskId, error });
    if (setFailed.isErr()) {
        await handlePayloadTooBigError({ taskId, error: setFailed.error });
        logger.error(`failed to set task ${taskId} as failed`, setFailed.error);
    }
    return setFailed;
}

async function handlePayloadTooBigError({ taskId, error }: { taskId: string; error: ClientError }): Promise<void> {
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
                await orchestratorClient.failed({ taskId, error: new NangoError('script_output_too_large') });
            }
        }
    } catch (err) {
        logger.error(`failed to handle payload too big error for task ${taskId}`, err);
    }
}

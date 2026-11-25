import { z } from 'zod';

import { report } from '@nangohq/utils';

import { envs } from '../env.js';
import { NoopEventListener } from '../events/noop.listener.js';
import { SqsEventListener } from '../events/sqs.listener.js';
import { handle } from '../execution/operations/handler.js';
import { nangoPropsSchema } from '../schemas/nango-props.js';

import type { EventListener, QueueMessage } from '../events/listener.js';
import type { NangoProps } from '@nangohq/types';

function lambdaErrorTypeFromMessage(errorMessage: string): 'function_runtime_out_of_memory' | 'function_runtime_timed_out' | 'function_runtime_other' {
    if (errorMessage.includes('signal: killed')) return 'function_runtime_out_of_memory';
    if (errorMessage.includes('Task timed out')) return 'function_runtime_timed_out';
    return 'function_runtime_other';
}

const parsedMessageSchema = z.object({
    requestContext: z
        .object({
            condition: z.string().optional()
        })
        .optional(),
    responseContext: z
        .object({
            functionError: z.string().optional(),
            statusCode: z.number().optional()
        })
        .optional(),
    responsePayload: z
        .object({
            errorMessage: z.string()
        })
        .nullish(),
    requestPayload: z.object({
        taskId: z.string(),
        nangoProps: nangoPropsSchema
    })
});

export class LambdaInvocationsProcessor {
    private eventListener: EventListener;
    private queueName: string;

    constructor() {
        if (envs.LAMBDA_FAILURE_DESTINATION) {
            this.eventListener = new SqsEventListener();
            this.queueName = envs.LAMBDA_FAILURE_DESTINATION;
        } else {
            this.eventListener = new NoopEventListener();
            this.queueName = 'noop';
        }
    }

    async start() {
        await this.eventListener.listen(this.queueName, async (message) => await this.processFailureMessage(message));
    }

    async stop() {
        await this.eventListener.stop();
    }

    private async processFailureMessage(message: QueueMessage) {
        const parsedMessage = parsedMessageSchema.parse(JSON.parse(message.body));
        const taskId = parsedMessage.requestPayload.taskId;
        const nangoProps = parsedMessage.requestPayload.nangoProps as unknown as NangoProps;

        // The function never ran, so there is no functionError. Lambda still sends the original payload here.
        if (parsedMessage.requestContext?.condition === 'EventAgeExceeded') {
            await failTask({
                taskId,
                nangoProps,
                type: 'function_runtime_event_age_exceeded',
                errorMessage: 'Lambda discarded the invocation because it exceeded the maximum event age',
                status: 500,
                durationMs: 0
            });
            return;
        }

        const functionError = parsedMessage.responseContext?.functionError;
        const errorMessage = parsedMessage.responsePayload?.errorMessage;
        if (functionError === 'Unhandled') {
            const message = errorMessage ?? 'Lambda reported an unhandled error without a message';
            const errorType = lambdaErrorTypeFromMessage(message);
            await failTask({
                taskId,
                nangoProps,
                type: errorType,
                errorMessage: message,
                status: parsedMessage.responseContext?.statusCode ?? 500,
                durationMs: getDurationMsFromErrorType(errorType)
            });
            return;
        }

        // A non-Unhandled functionError is ignored on purpose. Anything else used to fail schema
        // parsing, which the queue listener reported. Report it here, and fail the task when the
        // function never produced an error so the run does not stay running.
        if (functionError === undefined) {
            const condition = parsedMessage.requestContext?.condition;
            const message = condition ? `Lambda discarded the invocation (${condition})` : 'Lambda failure record had no function error';
            report(new Error(message), { taskId, condition });
            await failTask({
                taskId,
                nangoProps,
                type: 'function_runtime_other',
                errorMessage: message,
                status: 500,
                durationMs: 0
            });
            return;
        }

        if (errorMessage === undefined) {
            report(new Error('Lambda failure record had no error message'), { taskId, functionError });
        }
    }
}

function failTask(params: { taskId: string; nangoProps: NangoProps; type: string; errorMessage: string; status: number; durationMs: number }): Promise<void> {
    return handle({
        taskId: params.taskId,
        nangoProps: params.nangoProps,
        error: {
            type: params.type,
            payload: { errorMessage: params.errorMessage },
            status: params.status
        },
        telemetryBag: {
            customLogs: 0,
            proxyCalls: 0,
            durationMs: params.durationMs,
            memoryGb: envs.LAMBDA_DEFAULT_MEMORY_MB / 1024
        },
        functionRuntime: 'lambda',
        checkpoints: null
    });
}

function getDurationMsFromErrorType(errorType: 'function_runtime_out_of_memory' | 'function_runtime_timed_out' | 'function_runtime_other'): number {
    if (errorType === 'function_runtime_timed_out') return envs.LAMBDA_EXECUTION_TIMEOUT_SECS * 1000;
    if (errorType === 'function_runtime_out_of_memory') return envs.LAMBDA_DEFAULT_TIMEOUT_BILLING_SECS * 1000;
    return 0;
}

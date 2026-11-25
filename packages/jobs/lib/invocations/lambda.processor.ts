import { z } from 'zod';

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
            await handle({
                taskId,
                nangoProps,
                error: {
                    type: 'function_runtime_event_age_exceeded',
                    payload: { errorMessage: 'Lambda discarded the invocation because it exceeded the maximum event age' },
                    status: 500
                },
                telemetryBag: {
                    customLogs: 0,
                    proxyCalls: 0,
                    durationMs: 0,
                    memoryGb: envs.LAMBDA_DEFAULT_MEMORY_MB / 1024
                },
                functionRuntime: 'lambda',
                checkpoints: null
            });
            return;
        }

        const errorMessage = parsedMessage.responsePayload?.errorMessage;
        if (parsedMessage.responseContext?.functionError === 'Unhandled' && errorMessage !== undefined) {
            const errorType = lambdaErrorTypeFromMessage(errorMessage);
            await handle({
                taskId,
                nangoProps,
                error: {
                    type: errorType,
                    payload: { errorMessage },
                    status: parsedMessage.responseContext.statusCode ?? 500
                },
                telemetryBag: {
                    customLogs: 0,
                    proxyCalls: 0,
                    durationMs: getDurationMsFromErrorType(errorType),
                    memoryGb: envs.LAMBDA_DEFAULT_MEMORY_MB / 1024
                },
                functionRuntime: 'lambda',
                checkpoints: null
            });
        }
    }
}

function getDurationMsFromErrorType(errorType: 'function_runtime_out_of_memory' | 'function_runtime_timed_out' | 'function_runtime_other'): number {
    if (errorType === 'function_runtime_timed_out') return envs.LAMBDA_EXECUTION_TIMEOUT_SECS * 1000;
    if (errorType === 'function_runtime_out_of_memory') return envs.LAMBDA_DEFAULT_TIMEOUT_BILLING_SECS * 1000;
    return 0;
}

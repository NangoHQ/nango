import { z } from 'zod';

import { envs } from '../env.js';
import { SqsEventListener } from '../events/sqs.listener.js';
import { handleError } from '../execution/operations/handler.js';
import { nangoPropsSchema } from '../schemas/nango-props.js';

import type { EventListener, QueueMessage } from '../events/listener.js';
import type { NangoProps } from '@nangohq/types';

function lambdaErrorTypeFromMessage(errorMessage: string): 'function_runtime_out_of_memory' | 'function_runtime_timed_oud' | 'function_runtime_other' {
    if (errorMessage.includes('signal: killed')) return 'function_runtime_out_of_memory';
    if (errorMessage.includes('Task timed out')) return 'function_runtime_timed_oud';
    return 'function_runtime_other';
}

export class InvocationsProcessor {
    private eventListener: EventListener;

    constructor() {
        this.eventListener = new SqsEventListener();
    }

    async start() {
        if (envs.LAMBDA_FAILURE_DESTINATION) {
            await this.eventListener.listen(envs.LAMBDA_FAILURE_DESTINATION, async (message) => await this.processMessage(message));
        }
    }

    private async processMessage(message: QueueMessage) {
        const parsedMessage = z
            .object({
                responseContext: z.object({
                    functionError: z.string(),
                    statusCode: z.number()
                }),
                responsePayload: z.object({
                    errorMessage: z.string()
                }),
                requestPayload: z.object({
                    taskId: z.string(),
                    nangoProps: nangoPropsSchema
                })
            })
            .parse(JSON.parse(message.body));

        if (parsedMessage.responseContext.functionError === 'Unhandled') {
            const errorMessage = parsedMessage.responsePayload.errorMessage;
            await handleError({
                taskId: parsedMessage.requestPayload.taskId,
                nangoProps: parsedMessage.requestPayload.nangoProps as unknown as NangoProps,
                error: {
                    type: lambdaErrorTypeFromMessage(errorMessage),
                    payload: { errorMessage },
                    status: parsedMessage.responseContext.statusCode
                },
                telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 0 },
                functionRuntime: 'lambda'
            });
        }
    }
}

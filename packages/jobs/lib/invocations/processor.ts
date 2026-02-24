import { z } from 'zod';

import { envs } from '../env.js';
import { SqsEventListener } from '../events/sqs.listener.js';
import { handleError } from '../execution/operations/handler.js';

import type { EventListener, QueueMessage } from '../events/listener.js';
import type { NangoProps } from '@nangohq/types';

function lambdaErrorTypeFromMessage(errorMessage: string): 'lambda_out_of_memory' | 'lambda_timeout' | 'lambda_other' {
    if (errorMessage.includes('signal: killed')) return 'lambda_out_of_memory';
    if (errorMessage.includes('Task timed out')) return 'lambda_timeout';
    return 'lambda_other';
}

export class InvocationsProcessor {
    private eventListener: EventListener;

    constructor() {
        this.eventListener = new SqsEventListener();
    }

    async start() {
        if (envs.LAMBDA_FAILURE_DESTINATION) {
            await this.eventListener.listen(envs.LAMBDA_FAILURE_DESTINATION, (message) => this.processMessage(message));
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
                    nangoProps: z.record(z.string(), z.unknown())
                })
            })
            .parse(JSON.parse(message.body));

        if (parsedMessage.responseContext.functionError === 'Unhandled') {
            console.log('UNHANDLED ERROR:', parsedMessage.responsePayload.errorMessage);

            const errorMessage = parsedMessage.responsePayload.errorMessage;
            await handleError({
                taskId: parsedMessage.requestPayload.taskId,
                nangoProps: { ...(parsedMessage.requestPayload.nangoProps as unknown as NangoProps) },
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

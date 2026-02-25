import { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { getLogger, report } from '@nangohq/utils';

import type { EventListener, QueueMessage } from './listener.js';

const logger = getLogger('jobs.events.sqs');

/** Extract queue name from an SQS ARN (arn:aws:sqs:region:account-id:queue-name), or return as-is if not an ARN. */
function queueNameFromArn(queueOrArn: string): string {
    if (queueOrArn.startsWith('arn:')) {
        const parts = queueOrArn.split(':');
        return parts[parts.length - 1] ?? queueOrArn;
    }
    return queueOrArn;
}

const getRegion = (): string => {
    const env = typeof process !== 'undefined' ? process.env['LAMBDA_REGION'] : undefined;
    return env ?? 'us-west-2';
};

export class SqsEventListener implements EventListener {
    private readonly client: SQSClient;
    private abortController: AbortController | null = null;

    constructor() {
        this.client = new SQSClient({ region: getRegion() });
    }

    async listen(queue: string, onMessage?: (message: QueueMessage) => void | Promise<void>): Promise<void> {
        const queueName = queueNameFromArn(queue);
        const queueUrlRes = await this.getQueueUrl(queueName);
        if (queueUrlRes === null) {
            throw new Error(`SQS: could not get queue URL for ${queueName}`);
        }
        const queueUrl = queueUrlRes;

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        logger.info(`SQS: subscribing to queue ${queueName}`);

        try {
            while (true) {
                if (signal.aborted) break;

                try {
                    const result = await this.client.send(
                        new ReceiveMessageCommand({
                            QueueUrl: queueUrl,
                            MaxNumberOfMessages: 10,
                            WaitTimeSeconds: 20,
                            VisibilityTimeout: 60
                        }),
                        { abortSignal: signal }
                    );

                    const messages = result.Messages ?? [];
                    for (const msg of messages) {
                        if (signal.aborted) break;
                        if (!msg.Body || !msg.ReceiptHandle) continue;

                        try {
                            if (onMessage) {
                                await onMessage({ body: msg.Body });
                            }
                        } catch (err) {
                            logger.error('SQS message handler error', err);
                            continue;
                        }

                        await this.client.send(
                            new DeleteMessageCommand({
                                QueueUrl: queueUrl,
                                ReceiptHandle: msg.ReceiptHandle
                            }),
                            { abortSignal: signal }
                        );
                    }
                } catch (err) {
                    if (err instanceof Error && err.name === 'AbortError') {
                        break;
                    }
                    report(new Error('SQS receive message error'), {
                        queueName,
                        error: err
                    });
                    await new Promise((r) => setTimeout(r, 1000));
                }
            }
        } finally {
            this.abortController = null;
        }
    }

    private async getQueueUrl(queueName: string): Promise<string | null> {
        try {
            const result = await this.client.send(new GetQueueUrlCommand({ QueueName: queueName }));
            return result.QueueUrl ?? null;
        } catch (err) {
            report(new Error('SQS get queue URL failed'), {
                queueName,
                error: err
            });
            return null;
        }
    }

    async stop(): Promise<void> {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.client.destroy();
        return Promise.resolve();
    }
}

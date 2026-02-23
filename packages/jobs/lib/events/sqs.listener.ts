import { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { getLogger, report } from '@nangohq/utils';

import type { EventListener, QueueMessage } from './listener.js';

const logger = getLogger('jobs.events.sqs');

const getRegion = (): string => {
    const env = typeof process !== 'undefined' ? process.env['LAMBDA_REGION'] : undefined;
    return env ?? 'us-west-2';
};

export class SqsEventListener implements EventListener {
    private readonly client: SQSClient;

    constructor() {
        this.client = new SQSClient({ region: getRegion() });
    }

    async listen(queue: string, onMessage?: (message: QueueMessage) => void | Promise<void>): Promise<void> {
        const queueUrlRes = await this.getQueueUrl(queue);
        if (queueUrlRes === null) {
            throw new Error(`SQS: could not get queue URL for ${queue}`);
        }
        const queueUrl = queueUrlRes;

        logger.info(`SQS: subscribing to queue ${queue}`);

        while (true) {
            try {
                const result = await this.client.send(
                    new ReceiveMessageCommand({
                        QueueUrl: queueUrl,
                        MaxNumberOfMessages: 10,
                        WaitTimeSeconds: 20,
                        VisibilityTimeout: 60
                    })
                );

                const messages = result.Messages ?? [];
                for (const msg of messages) {
                    if (!msg.Body || !msg.ReceiptHandle) continue;

                    try {
                        if (onMessage) {
                            await onMessage({ body: msg.Body });
                        }
                    } catch (err) {
                        report(new Error('SQS message handler error'), {
                            queue,
                            error: err
                        });
                        continue;
                    }

                    await this.client.send(
                        new DeleteMessageCommand({
                            QueueUrl: queueUrl,
                            ReceiptHandle: msg.ReceiptHandle
                        })
                    );
                }
            } catch (err) {
                report(new Error('SQS receive message error'), {
                    queue,
                    error: err
                });
                await new Promise((r) => setTimeout(r, 1000));
            }
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
}

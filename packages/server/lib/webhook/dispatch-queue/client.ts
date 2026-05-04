import { SQSClient } from '@aws-sdk/client-sqs';

import { DispatchQueuePublisher } from './publisher.js';
import { envs } from '../../env.js';

function buildPublisher(): DispatchQueuePublisher | null {
    const url = envs.NANGO_TASK_DISPATCH_QUEUE_URL;
    if (!url) {
        return null;
    }
    if (new URL(url).pathname.replace(/\/$/, '').endsWith('.fifo')) {
        throw new Error('Webhook dispatch queue must be a Standard SQS queue; FIFO queues would serialize environment traffic.');
    }
    return new DispatchQueuePublisher({
        sqs: new SQSClient(envs.AWS_REGION ? { region: envs.AWS_REGION } : {}),
        queueUrl: url,
        batchSize: envs.NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE,
        publishConcurrency: envs.NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY
    });
}

/**
 * Singleton DispatchQueuePublisher, or null when `NANGO_TASK_DISPATCH_QUEUE_URL`
 * is unset (self-hosted / local dev). Callers must check for null before use.
 */
export const dispatchQueuePublisher: DispatchQueuePublisher | null = buildPublisher();

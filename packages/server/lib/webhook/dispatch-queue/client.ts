import { SQSClient } from '@aws-sdk/client-sqs';

import { DispatchQueuePublisher } from './publisher.js';
import { envs } from '../../env.js';

const getRegion = (): string => envs.AWS_SQS_REGION ?? 'us-west-2';

let cached: DispatchQueuePublisher | null | undefined;

/**
 * Returns the singleton DispatchQueuePublisher, or null when `NANGO_TASK_DISPATCH_QUEUE_URL`
 * is unset (self-hosted / local dev). Callers must check for null before use.
 */
export function getDispatchQueuePublisher(): DispatchQueuePublisher | null {
    if (cached !== undefined) return cached;
    const url = envs.NANGO_TASK_DISPATCH_QUEUE_URL;
    if (!url) {
        cached = null;
        return cached;
    }
    if (new URL(url).pathname.endsWith('.fifo')) {
        throw new Error('Webhook dispatch queue must be a Standard SQS queue; FIFO queues would serialize environment traffic.');
    }
    cached = new DispatchQueuePublisher({
        sqs: new SQSClient({ region: getRegion() }),
        queueUrl: url,
        batchSize: envs.NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE,
        publishConcurrency: envs.NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY
    });
    return cached;
}

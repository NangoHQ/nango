import { ChangeMessageVisibilityBatchCommand } from '@aws-sdk/client-sqs';

import type { SQSClient } from '@aws-sdk/client-sqs';

const SQS_BATCH_LIMIT = 10;
const SQS_MAX_VISIBILITY_SECONDS = 43_200;

interface VisibilityProps {
    sqs: SQSClient;
    queueUrl: string;
    receiptHandles: string[];
    visibilityTimeoutSeconds: number;
}

export function deferSeconds(delayMs: number, jitterRatio: number): number {
    const jittered = delayMs * (1 + Math.random() * jitterRatio);
    return Math.min(Math.max(1, Math.ceil(jittered / 1000)), SQS_MAX_VISIBILITY_SECONDS);
}

export async function changeVisibility({ sqs, queueUrl, receiptHandles, visibilityTimeoutSeconds }: VisibilityProps): Promise<void> {
    for (let i = 0; i < receiptHandles.length; i += SQS_BATCH_LIMIT) {
        const chunk = receiptHandles.slice(i, i + SQS_BATCH_LIMIT);
        const response = await sqs.send(
            new ChangeMessageVisibilityBatchCommand({
                QueueUrl: queueUrl,
                Entries: chunk.map((receiptHandle, index) => ({
                    Id: String(i + index),
                    ReceiptHandle: receiptHandle,
                    VisibilityTimeout: visibilityTimeoutSeconds
                }))
            })
        );
        if (response.Failed?.length) {
            throw new Error('webhook dispatch visibility batch partially failed', { cause: response.Failed });
        }
    }
}

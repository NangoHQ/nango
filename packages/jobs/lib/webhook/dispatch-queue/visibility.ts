import { ChangeMessageVisibilityBatchCommand } from '@aws-sdk/client-sqs';

import { report } from '@nangohq/utils';

import type { SQSClient } from '@aws-sdk/client-sqs';

const SQS_BATCH_LIMIT = 10;
const SQS_MAX_VISIBILITY_SECONDS = 43_200;

interface VisibilityProps {
    sqs: SQSClient;
    queueUrl: string;
    receiptHandles: string[];
    visibilityTimeoutSeconds: number;
}

/** Jitter is additive so a deferral never lands before the delay it was asked for. */
export function deferSeconds(delayMs: number, jitterRatio: number): number {
    const jittered = delayMs * (1 + Math.random() * jitterRatio);
    return Math.min(Math.max(1, Math.ceil(jittered / 1000)), SQS_MAX_VISIBILITY_SECONDS);
}

export async function changeVisibility({ sqs, queueUrl, receiptHandles, visibilityTimeoutSeconds }: VisibilityProps): Promise<void> {
    for (let i = 0; i < receiptHandles.length; i += SQS_BATCH_LIMIT) {
        const chunk = receiptHandles.slice(i, i + SQS_BATCH_LIMIT);
        await sqs.send(
            new ChangeMessageVisibilityBatchCommand({
                QueueUrl: queueUrl,
                Entries: chunk.map((receiptHandle, index) => ({
                    Id: String(i + index),
                    ReceiptHandle: receiptHandle,
                    VisibilityTimeout: visibilityTimeoutSeconds
                }))
            })
        );
    }
}

/**
 * Holds messages invisible while a dispatch call is in flight, so a slow orchestrator
 * cannot let them return to the queue mid-call. Returns a function that stops it.
 */
export function keepVisible(props: VisibilityProps & { maxExtensionMs: number }): () => void {
    if (props.receiptHandles.length === 0 || props.visibilityTimeoutSeconds <= 0 || props.maxExtensionMs <= 0) {
        return () => undefined;
    }

    const intervalMs = Math.max(1000, Math.floor((props.visibilityTimeoutSeconds * 1000) / 3));
    const deadline = Date.now() + props.maxExtensionMs;
    let extending = false;

    const timer = setInterval(() => {
        if (extending || Date.now() >= deadline) {
            return;
        }
        extending = true;
        changeVisibility(props)
            .catch((err: unknown) => {
                report(new Error('webhook dispatch consumer visibility extension failed', { cause: err }));
            })
            .finally(() => {
                extending = false;
            });
    }, intervalMs);
    timer.unref();

    return () => clearInterval(timer);
}

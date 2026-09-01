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

/** Stopping waits for an in-flight update so it cannot overwrite a subsequent visibility change. */
export function keepVisible(props: VisibilityProps & { maxExtensionMs: number }): () => Promise<void> {
    if (props.receiptHandles.length === 0 || props.visibilityTimeoutSeconds <= 0 || props.maxExtensionMs <= 0) {
        return () => Promise.resolve();
    }

    const intervalMs = Math.max(100, Math.floor((props.visibilityTimeoutSeconds * 1000) / 3));
    const deadline = Date.now() + props.maxExtensionMs;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<void> | undefined;

    const schedule = () => {
        timer = setTimeout(run, Math.min(intervalMs, deadline - Date.now()));
        timer.unref();
    };

    const run = () => {
        timer = undefined;
        if (stopped || Date.now() >= deadline) {
            return;
        }
        inFlight = changeVisibility(props)
            .catch((err: unknown) => {
                report(new Error('webhook dispatch consumer visibility extension failed', { cause: err }));
            })
            .finally(() => {
                inFlight = undefined;
                if (!stopped && Date.now() < deadline) {
                    schedule();
                }
            });
    };

    schedule();

    return async () => {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
        }
        await inFlight;
    };
}

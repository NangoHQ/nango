import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

// TODO: add support for subscriber ack/nack

export interface SubscribeProps<TSubject extends Event['subject'] = Event['subject']> {
    consumerGroup: string;
    subject: TSubject;
    callback: (event: Extract<Event, { subject: TSubject }>) => Promise<void> | void;
    /** SNS+SQS: concurrent long-poll loops for this subscription (default 1, clamped 1–10). Ignored by other transports. */
    concurrency?: number;
}

export class PublishFailure extends Error {
    idempotencyKey: string;

    constructor(idempotencyKey: string, message: string) {
        super(message);
        this.idempotencyKey = idempotencyKey;
    }
}

export interface PublishBatchResult {
    successful: string[];
    failed: PublishFailure[];
}

export interface PublishBatchProps<TSubject extends Event['subject'] = Event['subject']> {
    subject: TSubject;
    events: Extract<Event, { subject: NoInfer<TSubject> }>[];
    /** SNS+SQS: Concurrent batch publish requests (default 10, clamped 1–10). Ignored by other transports. */
    concurrency?: number;
}

export interface Transport {
    publish(event: Event): Promise<Result<void>>;
    /**
     * Publishes a batch of events in a best-effort manner: all events are attempted regardless of
     * individual failures. Check `result.failed` for partial failures. Fatal failures are captured
     * and returned as errors (e.g. transport unavailable).
     */
    publishBatch<TSubject extends Event['subject']>(props: PublishBatchProps<TSubject>): Promise<Result<PublishBatchResult>>;
    subscribe<TSubject extends Event['subject']>(params: SubscribeProps<TSubject>): void;
    connect(props?: { timeoutMs: number }): Promise<Result<void>>;
    disconnect(): Promise<Result<void>>;
}

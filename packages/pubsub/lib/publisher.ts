import { v4 as uuidv4 } from 'uuid';

import { Err, getLogger, metrics } from '@nangohq/utils';

import type { PublishBatchProps, PublishBatchResult, PublishFailure, Transport } from './transport/transport.js';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { SetOptional } from 'type-fest';

const logger = getLogger('pubsub.publisher');

export type MaybeStampedEvent<TSubject extends Event['subject'] = Event['subject']> = SetOptional<
    Extract<Event, { subject: TSubject }>,
    'idempotencyKey' | 'createdAt'
>;

export class Publisher {
    private transport: Transport;

    constructor(transport: Transport) {
        this.transport = transport;
    }

    public async publish(event: MaybeStampedEvent): Promise<Result<void>> {
        const res = await this.transport.publish({
            ...event,
            idempotencyKey: event.idempotencyKey ?? uuidv4(),
            createdAt: event.createdAt ?? new Date()
        });
        if (res.isErr()) {
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, 1, { subject: event.subject, success: 'false' });
        }
        return res;
    }

    public async publishBatch<TSubject extends Event['subject']>(
        props: Omit<PublishBatchProps<TSubject>, 'events'> & { events: MaybeStampedEvent<TSubject>[] }
    ): Promise<Result<PublishBatchResult>> {
        const stamped = props.events.map(
            (e) =>
                ({
                    ...e,
                    idempotencyKey: e.idempotencyKey ?? uuidv4(),
                    createdAt: e.createdAt ?? new Date()
                }) as unknown as Extract<Event, { subject: TSubject }>
        );

        // runtime sanity check for homogeneous subject
        const mismatchedEvents = props.events.filter((e) => e.subject !== props.subject);
        if (mismatchedEvents.length > 0) {
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, props.events.length, { subject: props.subject, success: 'false' });
            logger.error(`publishBatch contract violation: more than one subject in batch`, {
                expected: props.subject,
                unexpected: [...new Set(mismatchedEvents.map((e) => e.subject))],
                total: props.events.length
            });
            return Err(new Error(`All events must be of the provided subject: "${props.subject}"`));
        }

        const res = await this.transport.publishBatch({ ...props, events: stamped });

        // NOTE: `publish()` lacks logging when contrasted with `publishBatch()` because it already logs at the transport layer.
        // `publishBatch()` takes a different approach in keeping the transport lean and log-agnostic, and concentrating reporting
        // on this (Publisher) layer, so that consumers may still fire-and-forget publish attempts.
        reportBatchPublishResults(props.subject, props.events.length, res);

        return res;
    }
}

function reportBatchPublishResults(subject: Event['subject'], batchSize: number, res: Result<PublishBatchResult>) {
    if (res.isOk()) {
        const res_ = res.value;
        if (res_.failed.length > 0) {
            res_.failed.forEach((error: PublishFailure) => {
                logger.error(`publishBatch partial failure`, {
                    subject: subject,
                    ...error.toJSON()
                });
            });
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, res_.failed.length, { subject: subject, success: 'false' });
        }
    } else {
        logger.error(`publishBatch total failure`, { subject: subject, total: batchSize, error: res.error.message });
        metrics.increment(metrics.Types.PUBSUB_PUBLISH, batchSize, { subject: subject, success: 'false' });
    }
}

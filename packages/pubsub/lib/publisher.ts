import { v4 as uuidv4 } from 'uuid';

import { Err, metrics } from '@nangohq/utils';

import type { PublishBatchProps, PublishBatchResult, Transport } from './transport/transport.js';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { SetOptional } from 'type-fest';

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
        const stamped = props.events.map((e) => ({
            ...e,
            idempotencyKey: e.idempotencyKey ?? uuidv4(),
            createdAt: e.createdAt ?? new Date()
        }));

        // runtime sanity check for homogeneous subject
        if (props.events.find((e) => e.subject !== props.subject)) {
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, props.events.length, { subject: props.subject, success: 'false' });
            return Err(new Error(`All events must be of the provided subject: "${props.subject}"`));
        }

        const res = await this.transport.publishBatch({ ...props, events: stamped as unknown as Extract<Event, { subject: TSubject }>[] });

        if (res.isOk()) {
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, res.value.successful.length, { subject: props.subject, success: 'true' });
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, res.value.failed.length, { subject: props.subject, success: 'false' });
        } else {
            metrics.increment(metrics.Types.PUBSUB_PUBLISH, props.events.length, { subject: props.subject, success: 'false' });
        }

        return res;
    }
}

import { Subscriber } from '@nangohq/pubsub';

import { envs } from '../env.js';
import { logger } from '../utils.js';

import type { Transport } from '@nangohq/pubsub';

export class AuditProcessor {
    private subscriber: Subscriber;

    constructor({ transport }: { transport: Transport }) {
        this.subscriber = new Subscriber(transport);
    }

    public start(): void {
        logger.info('Starting audit subscriber...', { concurrency: envs.METERING_AUDIT_EVENTS_SUBSCRIBE_CONCURRENCY });

        this.subscriber.subscribe({
            consumerGroup: 'audit',
            subject: 'audit',
            concurrency: envs.METERING_AUDIT_EVENTS_SUBSCRIBE_CONCURRENCY,
            callback: (event) => {
                // Persistence (ClickHouse) is wired in a follow-up; for now events are acked and dropped.
                logger.debug('Dropping audit event', { type: event.type, resource: event.payload.resource, action: event.payload.action });
            }
        });
    }
}

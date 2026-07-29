import { Subscriber } from '@nangohq/pubsub';

import { envs } from '../env.js';
import { logger } from '../utils.js';

import type { AuditWriter } from '@nangohq/audit';
import type { Transport } from '@nangohq/pubsub';

export class AuditProcessor {
    private subscriber: Subscriber;
    private store: AuditWriter;

    constructor({ transport, store }: { transport: Transport; store: AuditWriter }) {
        this.subscriber = new Subscriber(transport);
        this.store = store;
    }

    public start(): void {
        logger.info('Starting audit subscriber...', { concurrency: envs.METERING_AUDIT_EVENTS_SUBSCRIBE_CONCURRENCY });

        this.subscriber.subscribe({
            consumerGroup: 'audit',
            subject: 'audit',
            concurrency: envs.METERING_AUDIT_EVENTS_SUBSCRIBE_CONCURRENCY,
            // Deliberately never throws. The transport acks whenever this callback resolves, so a failed
            // write drops the event instead of being retried and eventually sent to the DLQ. That keeps
            // parity with the direct-write path this replaces; throw-to-retry lands with the hardened
            // consumer, together with publish-side batching, in a subsequent PR.
            callback: async (event) => {
                try {
                    const result = await this.store.record(event.payload);
                    if (result.isErr()) {
                        logger.error(`Failed to store audit event: ${result.error.message}`);
                    }
                } catch (err) {
                    logger.error('Failed to store audit event', err);
                }
            }
        });
    }
}

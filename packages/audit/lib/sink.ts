import { Ok } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { Publisher } from '@nangohq/pubsub';
import type { Result } from '@nangohq/utils';

export interface AuditSink {
    record(event: AuditEvent): Promise<Result<void>>;
}

export class DropSink implements AuditSink {
    record(): Promise<Result<void>> {
        // no transport wired — self-hosted/managed tiers drop until their egress path lands
        return Promise.resolve(Ok(undefined));
    }
}

export class PubSubAuditSink implements AuditSink {
    // Reuses the process-wide publisher connected at startup, like every other producer.
    constructor(private readonly publisher: Publisher) {}

    record(event: AuditEvent): Promise<Result<void>> {
        return this.publisher.publish({ subject: 'audit', type: 'audit.recorded', payload: event });
    }
}

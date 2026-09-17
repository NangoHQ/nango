import type { AuditWriter } from '../store.js';
import type { Publisher } from '@nangohq/pubsub';
import type { SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class PubSubAuditWriter implements AuditWriter {
    constructor(private readonly publisher: Publisher) {}

    record(record: SerializedAuditEvent): Promise<Result<void>> {
        return this.publisher.publish({ subject: 'audit', type: 'audit.recorded', payload: record });
    }
}

import { getLogger, metrics } from '@nangohq/utils';

import { DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';

const logger = getLogger('Audit');

export class Audit {
    constructor(private readonly sink: AuditSink) {}

    // Fire-and-forget: never throws into the caller.
    record(event: AuditEvent): void {
        try {
            this.sink.record(event);
            metrics.increment(metrics.Types.AUDIT_EVENT_RECORDED, 1, { success: 'true', resource: event.resource, action: event.action });
        } catch (err) {
            metrics.increment(metrics.Types.AUDIT_EVENT_RECORDED, 1, { success: 'false', resource: event.resource, action: event.action });
            logger.error(`failed to record audit event`, err);
        }
    }
}

export const audit = new Audit(new DropSink());

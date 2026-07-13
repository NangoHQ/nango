import { getLogger, metrics } from '@nangohq/utils';

import { DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';

const logger = getLogger('Audit');

export class Audit {
    constructor(private readonly sink: AuditSink) {}

    // Fire-and-forget: never throws into the caller.
    record(event: AuditEvent): void {
        let success = 'true';
        try {
            this.sink.record(event);
        } catch (err) {
            success = 'false';
            logger.error(`failed to record audit event`, err);
        }
        try {
            metrics.increment(metrics.Types.AUDIT_EVENT_RECORDED, 1, { success, resource: event.resource, action: event.action });
        } catch {
            // metrics are best-effort; never let them break the fire-and-forget contract
        }
    }
}

export const audit = new Audit(new DropSink());

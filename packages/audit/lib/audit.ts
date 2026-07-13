import { getLogger } from '@nangohq/utils';

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
        } catch (err) {
            logger.error(`failed to record audit event`, err);
        }
    }
}

export const audit = new Audit(new DropSink());

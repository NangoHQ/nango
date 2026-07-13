import { getLogger } from '@nangohq/utils';

import type { AuditEvent } from './event.js';

const logger = getLogger('Audit');

export interface AuditSink {
    record(event: AuditEvent): void;
}

// No transport yet: events are dropped, logged at debug so it reads as intentional, not lost.
export class DropSink implements AuditSink {
    record(event: AuditEvent): void {
        logger.debug(`dropped ${event.resource}.${event.action}`);
    }
}

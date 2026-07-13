import type { AuditEvent } from './event.js';

export interface AuditSink {
    record(event: AuditEvent): void;
}

export class DropSink implements AuditSink {
    record(_event: AuditEvent): void {
        // no transport yet — v1 drops every event
    }
}

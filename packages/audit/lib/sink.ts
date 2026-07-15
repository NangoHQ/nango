import { Ok } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { Result } from '@nangohq/utils';

export interface AuditSink {
    record(event: AuditEvent): Promise<Result<void>>;
}

export class DropSink implements AuditSink {
    record(): Promise<Result<void>> {
        // no transport yet — v1 drops every event
        return Promise.resolve(Ok(undefined));
    }
}

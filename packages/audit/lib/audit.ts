import { Err } from '@nangohq/utils';

import { DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';
import type { Result } from '@nangohq/utils';

export class Audit {
    constructor(private readonly sink: AuditSink) {}

    // Never throws — sink failures come back as `Err` for the caller to handle (log, metric, …).
    async record(event: AuditEvent): Promise<Result<void>> {
        try {
            return await this.sink.record(event);
        } catch (err) {
            return Err(err);
        }
    }
}

export const audit = new Audit(new DropSink());

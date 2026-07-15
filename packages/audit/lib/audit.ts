import { Err } from '@nangohq/utils';

import { DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';
import type { Result } from '@nangohq/utils';

export class Audit {
    private sink: AuditSink;

    constructor(sink: AuditSink) {
        this.sink = sink;
    }

    // Swap the sink once the process has a connected publisher (see server bootstrap).
    setSink(sink: AuditSink): void {
        this.sink = sink;
    }

    // Never throws — sink failures come back as `Err` for the caller to handle (log, metric, …).
    async record(event: AuditEvent): Promise<Result<void>> {
        try {
            return await this.sink.record(event);
        } catch (err) {
            return Err(err);
        }
    }
}

// Drops by default; the server upgrades this to a pub/sub sink at startup on Cloud.
export const audit = new Audit(new DropSink());

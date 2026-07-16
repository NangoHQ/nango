import { Err, Ok } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { AuditStore, AuditTrailCursor } from './store.js';
import type { ApiAuditTrailEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class InvalidAuditCursorError extends Error {
    constructor() {
        super('invalid_audit_cursor');
    }
}

function decodeCursor(cursor: string): AuditTrailCursor | null {
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { occurredAt?: unknown; id?: unknown };
        if (typeof decoded.occurredAt === 'string' && typeof decoded.id === 'string') {
            return { occurredAt: decoded.occurredAt, id: decoded.id };
        }
        return null;
    } catch {
        return null;
    }
}

function encodeCursor(cursor: AuditTrailCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export class Audit {
    private readonly store: AuditStore;

    constructor(store: AuditStore) {
        this.store = store;
    }

    // Never throws — store failures come back as `Err` for the caller to handle (log, metric, …).
    async record(event: AuditEvent): Promise<Result<void>> {
        try {
            return await this.store.record(event);
        } catch (err) {
            return Err(err);
        }
    }

    // Account-scoped, most-recent-first. `cursor` is the opaque `nextCursor` of a previous page;
    // `from`/`to` optionally bound the window and combine with the cursor. Empty when audit isn't wired
    // to a backend.
    async listAuditTrailEvents({
        accountId,
        limit,
        cursor,
        from,
        to
    }: {
        accountId: number;
        limit: number;
        cursor?: string | undefined;
        from?: string | undefined;
        to?: string | undefined;
    }): Promise<Result<{ events: ApiAuditTrailEvent[]; nextCursor: string | null }>> {
        let before: AuditTrailCursor | undefined;
        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (!decoded) {
                return Err(new InvalidAuditCursorError());
            }
            before = decoded;
        }

        const result = await this.store.list({ accountId, limit, before, from, to });
        if (result.isErr()) {
            return Err(result.error);
        }
        return Ok({
            events: result.value.events,
            nextCursor: result.value.nextCursor ? encodeCursor(result.value.nextCursor) : null
        });
    }
}

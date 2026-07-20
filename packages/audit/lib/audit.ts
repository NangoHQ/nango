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

// The cursor mirrors what `toString(occurred_at)`/`toString(id)` produce; validate the shape here so a
// malformed value fails as InvalidAuditCursorError (400) instead of blowing up the ClickHouse bind (500).
const CURSOR_OCCURRED_AT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
const CURSOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string): AuditTrailCursor | null {
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { occurredAt?: unknown; id?: unknown };
        if (
            typeof decoded.occurredAt === 'string' &&
            typeof decoded.id === 'string' &&
            CURSOR_OCCURRED_AT_RE.test(decoded.occurredAt) &&
            CURSOR_ID_RE.test(decoded.id)
        ) {
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

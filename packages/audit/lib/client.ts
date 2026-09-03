import { randomUUID } from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import { auditCsvHeader, auditCsvRows } from './csv.js';

import type { AuditReader, AuditTrailCursor, AuditTrailFilter, AuditWriter } from './store.js';
import type { ApiAuditTrailEvent, AuditEvent, AuditExportMaxRows, AuditTrailTotal, AuditTrailVersion, StoredAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

// The date the shape shipped, not a timestamp; bump only on a breaking change.
const AUDIT_EVENT_VERSION: AuditTrailVersion = '2026-07-16';

// The response is built during the request, so the ceiling is what the load balancer's timeout allows.
export const AUDIT_EXPORT_MAX_ROWS: AuditExportMaxRows = 50_000;
const AUDIT_EXPORT_PAGE_SIZE = 10_000;

export class InvalidAuditCursorError extends Error {
    constructor() {
        super('invalid_audit_cursor');
    }
}

// The cursor mirrors ClickHouse's `toString(occurred_at)` / `toString(id)` output — a space-separated
// datetime `YYYY-MM-DD HH:MM:SS.mmm` (UTC, no `T`/`Z`) and a UUID, not ISO 8601. Validate the shape here so
// a malformed value fails as InvalidAuditCursorError (400) instead of blowing up the ClickHouse bind (500).
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

export class AuditClient {
    constructor(
        private readonly writer: AuditWriter,
        private readonly reader: AuditReader
    ) {}

    /**
     * Never throws — writer failures come back as `Err` for the caller to handle (log, metric, …).
     *
     * `id` is stamped here, not at storage, so a redelivered event keeps one identity and
     * ReplacingMergeTree can collapse the duplicate.
     */
    async record(event: AuditEvent): Promise<Result<void>> {
        const stored: StoredAuditEvent = { ...event, id: randomUUID(), version: AUDIT_EVENT_VERSION };
        try {
            return await this.writer.record({ event: JSON.stringify(stored) });
        } catch (err) {
            return Err(err);
        }
    }

    /**
     * Account-scoped, most-recent-first. `cursor` is the opaque `nextCursor` of a previous page;
     * `from`/`to` and the resource filters optionally narrow the set and combine with the cursor. Empty
     * when audit isn't wired to a backend.
     */
    async listAuditTrailEvents({
        accountId,
        limit,
        cursor,
        from,
        to,
        resources,
        actions
    }: {
        accountId: number;
        limit: number;
        cursor?: string | undefined;
        from?: string | undefined;
        to?: string | undefined;
        resources?: string[] | undefined;
        actions?: string[] | undefined;
    }): Promise<Result<{ events: ApiAuditTrailEvent[]; nextCursor: string | null }>> {
        let before: AuditTrailCursor | undefined;
        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (!decoded) {
                return Err(new InvalidAuditCursorError());
            }
            before = decoded;
        }

        return (await this.reader.list({ accountId, limit, before, from, to, resources, actions })).map((page) => ({
            events: page.events,
            nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null
        }));
    }

    /** Never throws, as `record` doesn't — a reader that rejects comes back as `Err` for the caller to handle. */
    async countAuditTrailEvents(filter: AuditTrailFilter): Promise<Result<AuditTrailTotal>> {
        try {
            return await this.reader.count(filter);
        } catch (err) {
            return Err(err);
        }
    }

    /** Builds the CSV for the window. `truncated` reports that `maxRows` cut the result, rather than failing the export. */
    async exportCsv({
        accountId,
        maxRows = AUDIT_EXPORT_MAX_ROWS,
        pageSize = AUDIT_EXPORT_PAGE_SIZE,
        from,
        to,
        resources,
        actions
    }: {
        accountId: number;
        maxRows?: number;
        pageSize?: number;
        from?: string | undefined;
        to?: string | undefined;
        resources?: string[] | undefined;
        actions?: string[] | undefined;
    }): Promise<Result<{ csv: string; rows: number; truncated: boolean }>> {
        const chunks: string[] = [];
        let rows = 0;
        let cursor: string | undefined;
        let truncated = false;

        do {
            const page = await this.listAuditTrailEvents({ accountId, limit: Math.min(pageSize, maxRows - rows), cursor, from, to, resources, actions });
            if (page.isErr()) {
                return Err(page.error);
            }
            const csv = auditCsvRows(page.value.events);
            if (csv) {
                chunks.push(csv);
            }
            rows += page.value.events.length;
            cursor = page.value.nextCursor ?? undefined;
            truncated = Boolean(cursor) && rows >= maxRows;
        } while (cursor && rows < maxRows);

        // A cursor is not proof that anything follows: the reader keys `hasMore` off the raw row count, so a
        // page thinned by a duplicate can report one while every remaining row is a copy. Confirm with one
        // read before telling the caller their export is incomplete.
        if (truncated && cursor) {
            const more = await this.listAuditTrailEvents({ accountId, limit: 1, cursor, from, to, resources, actions });
            if (more.isErr()) {
                return Err(more.error);
            }
            truncated = more.value.events.length > 0;
        }

        return Ok({ csv: [auditCsvHeader(), ...chunks].join('\n') + '\n', rows, truncated });
    }
}

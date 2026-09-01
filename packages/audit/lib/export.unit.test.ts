import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { AuditClient } from './client.js';

import type { AuditReader, AuditWriter } from './store.js';
import type { ApiAuditTrailEvent } from '@nangohq/types';

const event = (n: number): ApiAuditTrailEvent => ({
    id: `0000000${n}-0000-4000-8000-000000000000`,
    version: '2026-07-16',
    occurredAt: `2026-01-0${n}T00:00:00.000Z`,
    accountId: 42,
    scope: 'environment',
    environment: null,
    actor: { type: 'user', id: '5' },
    resource: 'connection',
    action: 'deleted',
    targets: [],
    context: {},
    outcome: 'success'
});

function readerServing(pages: ApiAuditTrailEvent[][]): { reader: AuditReader; limits: number[] } {
    const limits: number[] = [];
    let call = 0;
    const reader: AuditReader = {
        list: ({ limit }) => {
            limits.push(limit);
            const events = pages[call] ?? [];
            const hasMore = call < pages.length - 1;
            call += 1;
            return Promise.resolve(Ok({ events, nextCursor: hasMore ? { occurredAt: '2026-01-01 00:00:00.000', id: event(1).id } : null }));
        }
    };
    return { reader, limits };
}

function clientFor(reader: AuditReader): AuditClient {
    return new AuditClient({ record: () => Promise.resolve(Ok(undefined)) } as AuditWriter, reader);
}

describe('AuditClient.exportCsv', () => {
    it('returns a header-only document for an empty window', async () => {
        const { reader } = readerServing([[]]);
        const { csv, rows, truncated } = (await clientFor(reader).exportCsv({ accountId: 42, maxRows: 10, pageSize: 5 })).unwrap();

        expect(rows).toBe(0);
        expect(truncated).toBe(false);
        expect(csv.split('\n').filter(Boolean)).toHaveLength(1);
    });

    it('walks every page into one document, with a single header', async () => {
        const { reader } = readerServing([[event(1), event(2)], [event(3)]]);
        const { csv, rows, truncated } = (await clientFor(reader).exportCsv({ accountId: 42, maxRows: 10, pageSize: 2 })).unwrap();

        expect(rows).toBe(3);
        expect(truncated).toBe(false);
        const lines = csv.split('\n').filter(Boolean);
        expect(lines).toHaveLength(4);
        expect(lines[0]).toContain('occurred_at');
        expect(lines.slice(1).map((line) => line.split(',')[1])).toEqual([event(1).id, event(2).id, event(3).id]);
    });

    it('stops at maxRows and reports the export as truncated', async () => {
        const { reader } = readerServing([[event(1), event(2)], [event(3), event(4)], [event(5)]]);
        const { rows, truncated, csv } = (await clientFor(reader).exportCsv({ accountId: 42, maxRows: 4, pageSize: 2 })).unwrap();

        expect(rows).toBe(4);
        expect(truncated).toBe(true);
        expect(csv.split('\n').filter(Boolean)).toHaveLength(5);
    });

    it('never asks for more rows than the remaining budget', async () => {
        const { reader, limits } = readerServing([[event(1), event(2)], [event(3)]]);
        await clientFor(reader).exportCsv({ accountId: 42, maxRows: 3, pageSize: 2 });

        // Second page asks for 1, not 2: the budget, not the page size, bounds the last read.
        expect(limits).toEqual([2, 1]);
    });

    it('is not truncated when the last page exactly fills the budget and nothing follows', async () => {
        const { reader } = readerServing([[event(1), event(2)]]);
        const { rows, truncated } = (await clientFor(reader).exportCsv({ accountId: 42, maxRows: 2, pageSize: 2 })).unwrap();

        expect(rows).toBe(2);
        expect(truncated).toBe(false);
    });

    it('does not claim truncation when the cursor leads nowhere', async () => {
        // The reader can hand back a cursor from a page thinned by a duplicate, with no unique row left.
        const { reader } = readerServing([[event(1), event(2)], []]);
        const { rows, truncated } = (await clientFor(reader).exportCsv({ accountId: 42, maxRows: 2, pageSize: 2 })).unwrap();

        expect(rows).toBe(2);
        expect(truncated).toBe(false);
    });

    it('propagates a read failure instead of returning a partial document', async () => {
        const reader: AuditReader = { list: vi.fn().mockResolvedValue(Err('failed_to_list_audit_trail_events')) };
        const result = await clientFor(reader).exportCsv({ accountId: 42, maxRows: 10, pageSize: 5 });

        expect(result.isErr()).toBe(true);
    });
});

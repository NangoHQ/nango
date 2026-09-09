import { afterEach, describe, expect, it, vi } from 'vitest';

import { PersistClient } from './persist.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

function ndjsonResponse(lines: unknown[], status = 200): Response {
    const body = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
    return new Response(body, { status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('PersistClient.deleteOutdatedRecords', () => {
    const call = (client: PersistClient) =>
        client.deleteOutdatedRecords({
            model: 'Model',
            environmentId: 1,
            nangoConnectionId: 2,
            syncId: 'sync-1',
            syncJobId: 3,
            activityLogId: 'log-1'
        });

    it('extracts deletedKeys from the terminal done line, ignoring progress lines', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            ndjsonResponse([
                { status: 'in_progress', deleted: 3, page: 1 },
                { status: 'in_progress', deleted: 6, page: 2 },
                { status: 'in_progress', deleted: 9, page: 3 },
                { status: 'done', deletedKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()).toEqual({ deletedKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/environment/1/connection/2/sync/sync-1/job/3/outdated'),
            expect.objectContaining({ method: 'DELETE', body: expect.stringContaining('"model":"Model"') })
        );
    });

    it('requests a streamed NDJSON response via the Accept header, so persist can tell this client apart from a legacy one', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedKeys: ['x'] }]));
        vi.stubGlobal('fetch', fetchMock);

        const client = new PersistClient({ secretKey: 'secret' });
        await call(client);

        const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(options.headers);
        expect(headers.get('accept')).toEqual('application/x-ndjson');
    });

    it('rejects a done line whose deletedKeys is not an array of strings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedKeys: [1, 2, 3] }])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unexpected response');
    });

    it('succeeds with no progress lines at all (single-batch delete)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedKeys: ['x'] }])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()).toEqual({ deletedKeys: ['x'] });
    });

    it('returns an Err when the terminal line reports an error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                ndjsonResponse([
                    { status: 'in_progress', deleted: 3, page: 1 },
                    { status: 'error', error: { code: 'delete_outdated_records_failed', message: 'boom' } }
                ])
            )
        );

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('boom');
    });

    it('returns an Err for a non-ok HTTP status without treating the body as NDJSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 })));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unauthorized');
    });

    it('returns an Err when the response body is empty', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('stream ended without a terminal line');
    });

    it('returns an Err when the stream ends without a terminal done/error line', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                ndjsonResponse([
                    { status: 'in_progress', deleted: 3, page: 1 },
                    { status: 'in_progress', deleted: 6, page: 2 }
                ])
            )
        );

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('stream ended without a terminal line');
    });
});

describe('PersistClient.deleteHardAllRecords', () => {
    const call = (client: PersistClient) =>
        client.deleteHardAllRecords({
            model: 'Model',
            environmentId: 1,
            nangoConnectionId: 2,
            syncId: 'sync-1',
            syncJobId: 3
        });

    it('extracts deletedCount/hasMore from the terminal done line, ignoring progress lines', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            ndjsonResponse([
                { status: 'in_progress', deleted: 3, page: 1 },
                { status: 'in_progress', deleted: 6, page: 2 },
                { status: 'done', deletedCount: 6, hasMore: true }
            ])
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()).toEqual({ deletedCount: 6, hasMore: true });
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/environment/1/connection/2/sync/sync-1/job/3/records/hard'),
            expect.objectContaining({ method: 'DELETE', body: expect.stringContaining('"model":"Model"') })
        );
    });

    it('requests a streamed NDJSON response via the Accept header, so persist can tell this client apart from a legacy one', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedCount: 0, hasMore: false }]));
        vi.stubGlobal('fetch', fetchMock);

        const client = new PersistClient({ secretKey: 'secret' });
        await call(client);

        const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(options.headers);
        expect(headers.get('accept')).toEqual('application/x-ndjson');
    });

    it('rejects a done line with a malformed shape', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedCount: 'not-a-number', hasMore: false }])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unexpected response');
    });

    it('succeeds with no progress lines at all (single-batch delete)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ status: 'done', deletedCount: 42, hasMore: false }])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()).toEqual({ deletedCount: 42, hasMore: false });
    });

    it('returns an Err when the terminal line reports an error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                ndjsonResponse([
                    { status: 'in_progress', deleted: 3, page: 1 },
                    { status: 'error', error: { code: 'hard_delete_records_failed', message: 'boom' } }
                ])
            )
        );

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('boom');
    });

    it('returns an Err for a non-ok HTTP status without treating the body as NDJSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 })));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unauthorized');
    });

    it('returns an Err when the response body is empty', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('stream ended without a terminal line');
    });

    it('returns an Err when the stream ends without a terminal done/error line', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                ndjsonResponse([
                    { status: 'in_progress', deleted: 3, page: 1 },
                    { status: 'in_progress', deleted: 6, page: 2 }
                ])
            )
        );

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('stream ended without a terminal line');
    });
});

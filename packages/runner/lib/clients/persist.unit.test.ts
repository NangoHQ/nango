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

    it('extracts deletedKeys from the terminal result line, ignoring progress lines', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            ndjsonResponse([
                { type: 'progress', deleted: 3 },
                { type: 'progress', deleted: 6 },
                { type: 'progress', deleted: 9 },
                { type: 'result', deletedKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }
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

    it('rejects a successful result line whose deletedKeys is not an array of strings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ type: 'result', deletedKeys: 'not-an-array' }])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unexpected response');
    });

    it('returns an Err when the terminal line is a JSON value that is not an object (e.g. null)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([null])));

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unexpected response');
    });

    it('succeeds with no progress lines at all (single-batch delete)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ type: 'result', deletedKeys: ['x'] }])));

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
                    { type: 'progress', deleted: 3 },
                    { type: 'error', error: { code: 'delete_outdated_records_failed', message: 'boom' } }
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
        expect(res.isErr() && res.error.message).toContain('empty response');
    });

    it('returns an Err when the stream ends without a terminal result/error line', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                ndjsonResponse([
                    { type: 'progress', deleted: 3 },
                    { type: 'progress', deleted: 6 }
                ])
            )
        );

        const client = new PersistClient({ secretKey: 'secret' });
        const res = await call(client);

        expect(res.isErr()).toBe(true);
        expect(res.isErr() && res.error.message).toContain('unexpected response');
    });
});

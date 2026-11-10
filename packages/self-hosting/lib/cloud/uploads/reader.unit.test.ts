import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { TELEMETRY_UPLOAD_MAX_ROWS, TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES } from './constants.js';
import { readUpload } from './reader.js';

const installationId = '5f0d3c0e-6d5b-4a55-9d0c-1f2e3a4b5c6d';
const header = JSON.stringify({ kind: 'header', installation_id: installationId });
const row = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ kind: 'row', ts: '2026-11-08T00:00:00.000Z', metric: 'nango.hosted_metric.connections.count', attributes: {}, value: 1, ...overrides });

const upload = (...lines: string[]) => gzipSync(Buffer.from(lines.join('\n')));

async function failure(body: Buffer): Promise<{ code: string; message: string } | 'ok'> {
    const res = await readUpload(body);
    return res.isErr() ? { code: res.error.code, message: res.error.message } : 'ok';
}

describe('readUpload', () => {
    it('reads the installation from the header and one row per line', async () => {
        const res = await readUpload(upload(header, row({ value: 3 }), row({ ts: '2026-11-08T00:01:00.000Z', value: 5 })));

        expect(res.unwrap()).toEqual({
            installationId,
            rows: [
                { ts: new Date('2026-11-08T00:00:00.000Z'), metric: 'nango.hosted_metric.connections.count', attributes: '{}', value: 3 },
                { ts: new Date('2026-11-08T00:01:00.000Z'), metric: 'nango.hosted_metric.connections.count', attributes: '{}', value: 5 }
            ]
        });
    });

    it('serializes attributes the same way whatever order their keys came in', async () => {
        const res = await readUpload(
            upload(header, row({ attributes: { producer_id: 'a1', environment: 'prod' } }), row({ attributes: { environment: 'prod', producer_id: 'a1' } }))
        );

        expect(res.unwrap().rows.map((r) => r.attributes)).toEqual(['{"environment":"prod","producer_id":"a1"}', '{"environment":"prod","producer_id":"a1"}']);
    });

    it('accepts a header alone, and a final newline', async () => {
        expect((await readUpload(upload(header))).unwrap().rows).toEqual([]);
        expect((await readUpload(upload(header, row(), ''))).unwrap().rows).toHaveLength(1);
    });

    it('rejects a body that is not gzip', async () => {
        expect(await failure(Buffer.from(`${header}\n${row()}`))).toMatchObject({ code: 'invalid_encoding' });
    });

    it('rejects a body that inflates over the limit', async () => {
        expect(await failure(gzipSync(Buffer.alloc(TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES + 1)))).toMatchObject({ code: 'request_too_large' });
    });

    it.each([
        ['no line at all', []],
        ['a row first', [row()]],
        ['an installation that is not a uuid', [JSON.stringify({ kind: 'header', installation_id: 'byoc-acme' })]],
        ['a line that is not JSON', ['header']]
    ])('rejects %s as the header', async (_name, lines) => {
        expect(await failure(upload(...lines))).toMatchObject({ code: 'invalid_header' });
    });

    it('accepts the row limit and rejects one row more', async () => {
        const rows = Array.from({ length: TELEMETRY_UPLOAD_MAX_ROWS }, () => row());

        expect(await failure(upload(header, ...rows))).toBe('ok');
        expect(await failure(upload(header, ...rows, row()))).toEqual({ code: 'too_many_rows', message: 'an upload holds at most 32768 rows, got 32769' });
    });

    it.each([
        ['a value that is not finite', `{"kind":"row","ts":"2026-11-08T00:00:00.000Z","metric":"m","attributes":{},"value":1e999}`],
        ['a timestamp that is not UTC', row({ ts: '2026-11-08T00:00:00.000+01:00' })],
        ['a metric over 255 characters', row({ metric: 'm'.repeat(256) })],
        ['a nested attribute', row({ attributes: { environment: { name: 'prod' } } })],
        ['an attribute list', row({ attributes: { environments: ['prod'] } })],
        ['a second header', header],
        ['a line that is not JSON', 'row'],
        ['an empty line', '']
    ])('rejects %s, naming the line', async (_name, line) => {
        expect(await failure(upload(header, row(), line, row()))).toEqual({ code: 'invalid_row', message: 'line 3 is not a valid row' });
    });

    it('accepts attributes at the size limit and rejects one byte more', async () => {
        const padding = (bytes: number) => ({ k: 'x'.repeat(bytes - '{"k":""}'.length) });

        expect(await failure(upload(header, row({ attributes: padding(1024) })))).toBe('ok');
        expect(await failure(upload(header, row({ attributes: padding(1025) })))).toEqual({
            code: 'invalid_row',
            message: 'line 2 has attributes over 1024 bytes'
        });
    });
});

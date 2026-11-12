import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TELEMETRY_UPLOAD_MAX_LINE_BYTES, TELEMETRY_UPLOAD_MAX_ROWS, TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES } from './constants.js';
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
    beforeAll(() => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T12:00:00.000Z') });
    });

    afterAll(() => {
        vi.useRealTimers();
    });

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

    it('reads lines that are split between two inflated blocks', async () => {
        const rows = Array.from({ length: 2000 }, (_, value) => row({ value, attributes: { environment: `producción-${value}` } }));

        const res = (await readUpload(upload(header, ...rows))).unwrap();

        expect(res.rows.map((r) => r.value)).toEqual(rows.map((_, value) => value));
        expect(res.rows.at(-1)?.attributes).toBe('{"environment":"producción-1999"}');
    });

    it('reads the installation in lower case', async () => {
        const res = await readUpload(upload(JSON.stringify({ kind: 'header', installation_id: installationId.toUpperCase() })));

        expect(res.unwrap().installationId).toBe(installationId);
    });

    it('accepts a header alone, and a final newline', async () => {
        expect((await readUpload(upload(header))).unwrap().rows).toEqual([]);
        expect((await readUpload(upload(header, row(), ''))).unwrap().rows).toHaveLength(1);
    });

    it('rejects a body that is not gzip', async () => {
        expect(await failure(Buffer.from(`${header}\n${row()}`))).toMatchObject({ code: 'invalid_encoding' });
    });

    it('rejects text that is not valid UTF-8 instead of storing a repaired copy', async () => {
        const [before, after] = row({ metric: 'nango.hosted_metric.SPLIT' }).split('SPLIT') as [string, string];
        const body = gzipSync(Buffer.concat([Buffer.from(`${header}\n${before}`), Buffer.from([0xff]), Buffer.from(after)]));

        expect(await failure(body)).toMatchObject({ code: 'invalid_encoding' });
    });

    it('rejects a body that inflates over the limit', async () => {
        const padded = row().padEnd(TELEMETRY_UPLOAD_MAX_LINE_BYTES);
        const rows = Array.from({ length: Math.ceil(TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES / (padded.length + 1)) }, () => padded);

        expect(await failure(upload(header, ...rows))).toMatchObject({ code: 'request_too_large' });
    });

    it('accepts a line at the size limit and rejects one byte more', async () => {
        expect(await failure(upload(header, row().padEnd(TELEMETRY_UPLOAD_MAX_LINE_BYTES), row()))).toBe('ok');
        expect(await failure(upload(header, row(), row().padEnd(TELEMETRY_UPLOAD_MAX_LINE_BYTES + 1), row()))).toEqual({
            code: 'invalid_row',
            message: 'line 3 is over 4096 bytes'
        });
        expect(await failure(upload(header, row(), ' '.repeat(TELEMETRY_UPLOAD_MAX_UNCOMPRESSED_BYTES)))).toEqual({
            code: 'invalid_row',
            message: 'line 3 is over 4096 bytes'
        });
        expect(await failure(upload(header.padEnd(TELEMETRY_UPLOAD_MAX_LINE_BYTES + 1), row()))).toMatchObject({ code: 'invalid_header' });
    });

    it('accepts timestamps from 366 days ago to one day ahead', async () => {
        expect(await failure(upload(header, row({ ts: '2025-11-08T12:00:00.000Z' }), row({ ts: '2026-11-10T12:00:00.000Z' })))).toBe('ok');
        expect(await failure(upload(header, row(), row({ ts: '2025-11-08T11:59:59.999Z' })))).toEqual({
            code: 'invalid_row',
            message: 'line 3 has a timestamp too far in the past or the future'
        });
        expect(await failure(upload(header, row(), row({ ts: '2026-11-10T12:00:00.001Z' })))).toEqual({
            code: 'invalid_row',
            message: 'line 3 has a timestamp too far in the past or the future'
        });
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
        expect(await failure(upload(header, ...rows, ''))).toBe('ok');
        expect(await failure(upload(header, ...rows, row()))).toEqual({ code: 'too_many_rows', message: 'an upload holds at most 32768 rows' });
        expect(await failure(upload(header, ...rows, '', row()))).toMatchObject({ code: 'too_many_rows' });
        expect(await failure(upload(header, ...rows, '', ''))).toMatchObject({ code: 'too_many_rows' });
    });

    it.each([
        ['a value that is not finite', `{"kind":"row","ts":"2026-11-08T00:00:00.000Z","metric":"m","attributes":{},"value":1e999}`],
        ['a timestamp that is not UTC', row({ ts: '2026-11-08T00:00:00.000+01:00' })],
        ['a timestamp finer than a millisecond', row({ ts: '2026-11-08T00:00:00.000123Z' })],
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

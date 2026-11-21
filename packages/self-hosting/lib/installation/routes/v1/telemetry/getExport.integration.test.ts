import { createHash, generateKeyPairSync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { jwtVerify } from 'jose';
import knexFactory from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOSTED_TELEMETRY_TABLE, migrate as migrateTelemetry } from '@nangohq/hosted-telemetry';
import { ensureDailyPartitions } from '@nangohq/migrations';

import { INSTALLATION_EXPORT_SIGNATURE_TYPE } from '../../../manual-telemetry-export.js';
import { createInstallationServer } from '../../../server.js';
import { route } from './getExport.js';

import type { ManualTelemetryExportConfig, ManualTelemetryExportHeader, ManualTelemetryExportTrailer } from '../../../manual-telemetry-export.js';
import type { Knex } from 'knex';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const schema = 'hosted_telemetry_export_test';
const installationId = '5f0d3c0e-6d5b-4a55-9d0c-1f2e3a4b5c6d';
const key = 'k'.repeat(48);
const concurrency = 'nango.hosted_metric.active_concurrency.max';
const connections = 'nango.hosted_metric.connections.count';
const now = new Date('2026-11-10T08:00:00Z');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const installation = {
    installationId,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    metrics: [concurrency, connections],
    retentionDays: 90,
    licenseGraceUntil: new Date('2028-01-30T00:00:00Z')
};

let knex: Knex;
let api: Server;
let url: string;
const servers: Server[] = [];

async function listen(config: ManualTelemetryExportConfig | null): Promise<Server> {
    const server = createInstallationServer({ manualTelemetryExport: config }).listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return server;
}

const address = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function download(
    query: Record<string, string>,
    { authorization = `Bearer ${key}`, to = url }: { authorization?: string | null; to?: string } = {}
): Promise<Response> {
    return await fetch(`${to}${route.path}?${new URLSearchParams(query).toString()}`, {
        method: route.method,
        headers: { ...(authorization && { authorization }) }
    });
}

/** Reads a file the way the import will: the signature must be for the bytes above the trailer. */
async function read(text: string): Promise<{ header: ManualTelemetryExportHeader; rows: Record<string, unknown>[]; verified: boolean }> {
    const lines = text.trimEnd().split('\n');
    const [header, ...rest] = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const trailer = rest.pop() as unknown as ManualTelemetryExportTrailer | undefined;
    const signed = text.slice(0, text.length - (lines.at(-1)?.length ?? 0) - 1);
    let verified = false;
    try {
        const { payload } = await jwtVerify(trailer?.signature ?? '', publicKey, { algorithms: ['EdDSA'], typ: INSTALLATION_EXPORT_SIGNATURE_TYPE });
        verified = payload['body_sha256'] === createHash('sha256').update(signed).digest('base64url');
    } catch {
        verified = false;
    }
    return { header: header as unknown as ManualTelemetryExportHeader, rows: rest, verified };
}

const text = async (res: Response) => gunzipSync(Buffer.from(await res.arrayBuffer())).toString();

async function insert(...rows: { ts: string; metric: string; attributes?: Record<string, unknown>; value?: number }[]): Promise<void> {
    await knex
        .withSchema(schema)
        .table(HOSTED_TELEMETRY_TABLE)
        .insert(rows.map((row) => ({ ts: new Date(row.ts), metric: row.metric, attributes: row.attributes ?? {}, value: row.value ?? 1 })));
}

beforeAll(async () => {
    const postgres = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: postgres } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrateTelemetry({ knex, schema })).unwrap();
    (
        await ensureDailyPartitions({
            knex,
            schema,
            table: HOSTED_TELEMETRY_TABLE,
            dates: ['2026-11-07', '2026-11-08', '2026-11-09'].map((day) => new Date(`${day}T12:00:00Z`))
        })
    ).unwrap();

    api = await listen({ key, knex, schema, ...installation });
    url = address(api);
});

afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now });
    await knex.raw('TRUNCATE ??.??', [schema, HOSTED_TELEMETRY_TABLE]);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('GET /v1/telemetry/export', () => {
    it('exports every row of the days asked for, ordered by metric then time, as a signed gzip file', async () => {
        await insert(
            { ts: '2026-11-07T23:59:00Z', metric: concurrency, value: 1 },
            { ts: '2026-11-08T00:00:00Z', metric: connections, value: 40 },
            { ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3, attributes: { producer_id: 'b' } },
            { ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 2, attributes: { producer_id: 'a' } },
            { ts: '2026-11-08T23:59:00Z', metric: concurrency, value: 5 },
            { ts: '2026-11-09T00:00:00Z', metric: concurrency, value: 7 }
        );

        const res = await download({ from: '2026-11-08', to: '2026-11-09' });

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('application/gzip');
        expect(res.headers.get('content-disposition')).toBe(`attachment; filename="nango-telemetry-${installationId}-2026-11-08-2026-11-09.ndjson.gz"`);
        expect(await read(await text(res))).toEqual({
            header: {
                kind: 'header',
                installation_id: installationId,
                from: '2026-11-08T00:00:00.000Z',
                to: '2026-11-09T00:00:00.000Z',
                metrics: [concurrency, connections]
            },
            rows: [
                { kind: 'row', ts: '2026-11-08T10:00:00.000Z', metric: concurrency, attributes: { producer_id: 'a' }, value: 2 },
                { kind: 'row', ts: '2026-11-08T10:00:00.000Z', metric: concurrency, attributes: { producer_id: 'b' }, value: 3 },
                { kind: 'row', ts: '2026-11-08T23:59:00.000Z', metric: concurrency, attributes: {}, value: 5 },
                { kind: 'row', ts: '2026-11-08T00:00:00.000Z', metric: connections, attributes: {}, value: 40 }
            ],
            verified: true
        });
    });

    it('exports a range without rows as a header and its signed trailer', async () => {
        const res = await download({ from: '2026-11-07', to: '2026-11-10' });

        expect(res.status).toBe(200);
        expect(await read(await text(res))).toMatchObject({ rows: [], verified: true });
    });

    it('signs a file of several pages as one', async () => {
        await knex.raw(
            `INSERT INTO ??.?? (ts, metric, attributes, value)
             SELECT '2026-11-08T00:00:00Z'::timestamptz + minute * interval '1 minute', ?, jsonb_build_object('producer_id', 'p' || producer), minute
             FROM generate_series(0, 1439) AS minute, generate_series(1, 18) AS producer`,
            [schema, HOSTED_TELEMETRY_TABLE, concurrency]
        );

        const file = await read(await text(await download({ from: '2026-11-08', to: '2026-11-09' })));

        expect(file.rows).toHaveLength(1440 * 18);
        expect(file.verified).toBe(true);
    });

    it('does not verify a file that was changed or cut short', async () => {
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 }, { ts: '2026-11-08T11:00:00Z', metric: concurrency, value: 4 });
        const file = await text(await download({ from: '2026-11-08', to: '2026-11-09' }));
        const lines = file.trimEnd().split('\n');

        expect((await read(file)).verified).toBe(true);
        expect((await read(file.replace('"value":3', '"value":30'))).verified).toBe(false);
        expect((await read(`${[lines[0], lines[2], lines[3]].join('\n')}\n`)).verified).toBe(false);
        expect((await read(`${lines.slice(0, -1).join('\n')}\n`)).verified).toBe(false);
    });

    it('rejects a request without the export key or with another key', async () => {
        const range = { from: '2026-11-08', to: '2026-11-09' };
        const missing = await download(range, { authorization: null });
        const notBearer = await download(range, { authorization: `Basic ${key}` });
        const wrong = await download(range, { authorization: `Bearer ${'x'.repeat(48)}` });
        const longer = await download(range, { authorization: `Bearer ${key}k` });

        expect(missing.status).toBe(401);
        expect(await missing.json()).toEqual({ error: { code: 'missing_key', message: 'an export key is required' } });
        expect(notBearer.status).toBe(401);
        expect(await notBearer.json()).toMatchObject({ error: { code: 'missing_key' } });
        expect(wrong.status).toBe(401);
        expect(await wrong.json()).toEqual({ error: { code: 'invalid_key', message: 'the export key is not valid' } });
        expect(longer.status).toBe(401);
        expect(await longer.json()).toMatchObject({ error: { code: 'invalid_key' } });
    });

    it.each([
        ['a timestamp instead of a day', { from: '2026-11-08T00:00:00Z', to: '2026-11-09' }, 'must be a day written as YYYY-MM-DD'],
        ['a range that ends where it starts', { from: '2026-11-08', to: '2026-11-08' }, '`to` must be after `from`'],
        ['more than 31 days', { from: '2026-10-09', to: '2026-11-10' }, 'an export holds at most 31 days'],
        ['a day that is not over', { from: '2026-11-08', to: '2026-11-11' }, 'the last day of the range is not complete yet'],
        ['a day the installation no longer keeps', { from: '2026-08-11', to: '2026-08-12' }, 'the installation only keeps 90 days of telemetry'],
        ['a parameter we do not know', { from: '2026-11-08', to: '2026-11-09', metric: concurrency }, 'Unrecognized key']
    ])('rejects %s', async (_name, query, message) => {
        const res = await download(query);

        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain(message);
    });

    it('only says that a day is badly written, without checking the range it would give', async () => {
        const res = await download({ from: 'last week', to: '2026-11-09' });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: { code: 'invalid_request', errors: [{ code: 'invalid_format', message: 'must be a day written as YYYY-MM-DD', path: ['from'] }] }
        });
    });

    it('accepts 31 days, the oldest day still kept, and yesterday only once its last rows had time to be written', async () => {
        expect((await download({ from: '2026-10-10', to: '2026-11-10' })).status).toBe(200);
        expect((await download({ from: '2026-08-12', to: '2026-08-13' })).status).toBe(200);

        vi.setSystemTime(new Date('2026-11-10T00:14:59Z'));
        expect((await download({ from: '2026-11-09', to: '2026-11-10' })).status).toBe(400);

        vi.setSystemTime(new Date('2026-11-10T00:15:00Z'));
        expect((await download({ from: '2026-11-09', to: '2026-11-10' })).status).toBe(200);
    });

    it('answers 500 before sending anything when the telemetry cannot be read', async () => {
        const broken = await listen({ key, knex, schema: 'a_schema_that_does_not_exist', ...installation });

        const res = await download({ from: '2026-11-08', to: '2026-11-09' }, { to: address(broken) });

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: { code: 'server_error', message: 'the telemetry could not be read' } });
    });

    it('rejects the export once the grace period of the license has ended', async () => {
        const expired = await listen({ key, knex, schema, ...installation, licenseGraceUntil: new Date('2026-11-10T07:59:59Z') });

        const res = await download({ from: '2026-11-08', to: '2026-11-09' }, { to: address(expired) });

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
            error: { code: 'license_expired', message: 'the grace period of the license ended on 2026-11-10T07:59:59.000Z' }
        });
    });

    it('does not exist on an installation without an export key', async () => {
        const off = await listen(null);

        const res = await download({ from: '2026-11-08', to: '2026-11-09' }, { to: address(off) });

        expect(res.status).toBe(404);
    });
});

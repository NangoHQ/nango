import { createClient } from '@clickhouse/client';
import knexFactory from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOSTED_TELEMETRY_TABLE, HOSTED_TELEMETRY_UPLOADS_TABLE, listPendingUploads, migrate as migrateTelemetry } from '@nangohq/hosted-telemetry';
import { ensureDailyPartitions } from '@nangohq/migrations';

import { installationsClickhouseClient } from '../cloud/clickhouse/clickhouse.js';
import { migrate as migrateClickhouse } from '../cloud/clickhouse/migrate.js';
import { migrate as migrateRegistry } from '../cloud/db/migrate.js';
import { seedInstallation } from '../cloud/seeders/installation.seeder.js';
import { createCloudServer } from '../cloud/server.js';
import { TELEMETRY_UPLOAD_MAX_ROWS } from '../cloud/uploads/constants.js';
import { uploadPendingDays, UploadRequestError } from './uploader.js';

import type { UploaderConfig } from './uploader.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Knex } from 'knex';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const registry = 'self_hosting_uploader_test';
const telemetry = 'hosted_telemetry_uploader_test';
const database = 'installations_uploader_test';

const concurrency = 'nango.hosted_metric.active_concurrency.max';
const connections = 'nango.hosted_metric.connections.count';
const now = new Date('2026-11-10T08:00:00Z');
const since = new Date('2026-10-01T00:00:00Z');

let knex: Knex;
let admin: ClickHouseClient;
let clickhouse: ClickHouseClient;
let api: Server;
let url: string;

async function insert(...rows: { ts: string; metric: string; attributes?: Record<string, unknown>; value?: number }[]): Promise<void> {
    await knex
        .withSchema(telemetry)
        .table(HOSTED_TELEMETRY_TABLE)
        .insert(rows.map((row) => ({ ts: new Date(row.ts), metric: row.metric, attributes: row.attributes ?? {}, value: row.value ?? 1 })));
}

/** One row a minute for 28 producers: more than a page for a single metric and day. */
const BIG_DAY_ROWS = 1440 * 28;
async function insertBigDay(metric: string): Promise<void> {
    await knex.raw(
        `INSERT INTO ??.?? (ts, metric, attributes, value)
         SELECT '2026-11-08T00:00:00Z'::timestamptz + minute * interval '1 minute', ?, jsonb_build_object('producer_id', 'p' || producer), minute
         FROM generate_series(0, 1439) AS minute, generate_series(1, 28) AS producer`,
        [telemetry, HOSTED_TELEMETRY_TABLE, metric]
    );
}

async function stored(installationId: string): Promise<{ ts: string; metric: string; value: number }[]> {
    const res = await admin.query({
        query: `SELECT ts, metric, value FROM {db:Identifier}.metrics FINAL WHERE installation_id = {id:UUID} ORDER BY metric, ts, attributes`,
        format: 'JSONEachRow',
        query_params: { db: database, id: installationId }
    });
    return res.json();
}

const pending = async () => (await listPendingUploads(knex, { since, schema: telemetry })).unwrap();

async function uploader(name: string, options?: { licensed?: boolean }): Promise<UploaderConfig> {
    const { uuid, privateKeyPem } = await seedInstallation({ knex, schema: registry }, name, options);
    return { knex, schema: telemetry, installationId: uuid, privateKeyPem, url };
}

beforeAll(async () => {
    const postgres = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({ client: 'pg', connection: { connectionString: postgres } });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [registry]);
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [telemetry]);
    (await migrateRegistry({ knex, schema: registry })).unwrap();
    (await migrateTelemetry({ knex, schema: telemetry })).unwrap();
    (
        await ensureDailyPartitions({
            knex,
            schema: telemetry,
            table: HOSTED_TELEMETRY_TABLE,
            dates: ['2026-10-10', '2026-10-11', '2026-11-08', '2026-11-09', '2026-11-10'].map((day) => new Date(`${day}T12:00:00Z`))
        })
    ).unwrap();

    const clickhouseUrl = process.env['CLICKHOUSE_URL']!;
    admin = createClient({ url: clickhouseUrl });
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    (await migrateClickhouse({ clickhouseUrl, database })).unwrap();
    clickhouse = installationsClickhouseClient(clickhouseUrl, { database });

    api = createCloudServer({ db: { knex, schema: registry }, clickhouse }).listen(0);
    await new Promise((resolve) => api.once('listening', resolve));
    url = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise((resolve) => api.close(resolve));
    await clickhouse.close();
    await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
    await admin.close();
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [registry]);
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [telemetry]);
    await knex.destroy();
});

beforeEach(async () => {
    await knex.raw('TRUNCATE ??.??, ??.??', [telemetry, HOSTED_TELEMETRY_TABLE, telemetry, HOSTED_TELEMETRY_UPLOADS_TABLE]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('uploadPendingDays', () => {
    it('sends every metric of each closed day to Nango and leaves the running day alone', async () => {
        const config = await uploader('closed-days');
        await insert(
            { ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 },
            { ts: '2026-11-08T10:00:00Z', metric: connections, value: 40 },
            { ts: '2026-11-09T23:59:00Z', metric: concurrency, value: 5 },
            { ts: '2026-11-10T07:00:00Z', metric: concurrency, value: 7 }
        );

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 3, failed: 0 });
        expect(await stored(config.installationId)).toEqual([
            { ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 },
            { ts: '2026-11-09 23:59:00.000', metric: concurrency, value: 5 },
            { ts: '2026-11-08 10:00:00.000', metric: connections, value: 40 }
        ]);
        expect(await pending()).toEqual([]);
    });

    it('goes back thirty days and no further', async () => {
        const config = await uploader('backfill');
        await insert({ ts: '2026-10-10T10:00:00Z', metric: concurrency, value: 1 }, { ts: '2026-10-11T10:00:00Z', metric: concurrency, value: 2 });

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0 });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-10-11 10:00:00.000', metric: concurrency, value: 2 }]);
    });

    it('sends nothing twice', async () => {
        const config = await uploader('once');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency });
        (await uploadPendingDays(config, { now })).unwrap();
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 0, failed: 0 });
        expect(requests).not.toHaveBeenCalled();
    });

    it('sends a day that is larger than a page in several requests', async () => {
        const config = await uploader('paged');
        await insertBigDay(concurrency);
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0 });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('resumes a day after the last page Nango acknowledged', async () => {
        const config = await uploader('resumed');
        await insertBigDay(concurrency);
        const send = globalThis.fetch;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(globalThis, 'fetch').mockImplementationOnce(send).mockRejectedValue(new Error('socket hang up'));

        const interrupted = await uploadPendingDays(config, { now });

        expect(interrupted.isErr() && interrupted.error).toBeInstanceOf(UploadRequestError);
        expect(await stored(config.installationId)).toHaveLength(TELEMETRY_UPLOAD_MAX_ROWS);
        expect(await pending()).toMatchObject([{ day: '2026-11-08', metric: concurrency, cursor: { ts: expect.any(Date) } }]);

        vi.restoreAllMocks();
        const requests = vi.spyOn(globalThis, 'fetch');
        const resumed = await uploadPendingDays(config, { now });

        expect(resumed.unwrap()).toEqual({ succeeded: 1, failed: 0 });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('marks a day Nango turns down as failed, never sends it again, and goes on with the others', async () => {
        const config = await uploader('turned-down');
        const tooLong = 'm'.repeat(300);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: tooLong }, { ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 5 });

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 1 });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 5 }]);
        expect(await pending()).toEqual([]);

        const requests = vi.spyOn(globalThis, 'fetch');
        expect((await uploadPendingDays(config, { now })).unwrap()).toEqual({ succeeded: 0, failed: 0 });
        expect(requests).not.toHaveBeenCalled();
    });

    it('marks every day as failed when Nango does not accept the installation', async () => {
        const config = await uploader('unlicensed', { licensed: false });
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 0, failed: 2 });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await pending()).toEqual([]);
    });

    it('tries again within the run when Nango fails on its side', async () => {
        const config = await uploader('second-attempt');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'insert_failed' } }, { status: 500 }));

        const res = await uploadPendingDays(config, { now });

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0 });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 }]);
    });

    it.each([
        ['after three attempts when Nango keeps failing on its side', 500, 'insert_failed', 3],
        ['at once when the clocks disagree', 401, 'clock_skew', 1]
    ])('stops at the first day and keeps everything, %s', async (_name, status, code, attempts) => {
        const config = await uploader(`kept-${code}`);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(() => Promise.resolve(Response.json({ error: { code, message: 'not now' } }, { status })));

        const res = await uploadPendingDays(config, { now });

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status, code });
        expect(requests).toHaveBeenCalledTimes(attempts);
        expect(await pending()).toHaveLength(2);
    });

    it('stops at the first day and keeps everything, after three attempts when Nango cannot be reached', async () => {
        const config = { ...(await uploader('unreachable')), url: 'http://127.0.0.1:1' };
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await uploadPendingDays(config, { now });

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: undefined, message: 'could not reach http://127.0.0.1:1' });
        expect(requests).toHaveBeenCalledTimes(3);
        expect(await pending()).toHaveLength(2);
    });
});

import { setTimeout } from 'node:timers/promises';

import { createClient } from '@clickhouse/client';
import knexFactory from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOSTED_TELEMETRY_TABLE, HOSTED_TELEMETRY_UPLOADS_TABLE, listQueuedUploads, migrate as migrateTelemetry } from '@nangohq/hosted-telemetry';
import { ensureDailyPartitions } from '@nangohq/migrations';

import { installationsClickhouseClient } from '../cloud/clickhouse/clickhouse.js';
import { migrate as migrateClickhouse } from '../cloud/clickhouse/migrate.js';
import { migrate as migrateRegistry } from '../cloud/db/migrate.js';
import { seedInstallation } from '../cloud/seeders/installation.seeder.js';
import { createCloudServer } from '../cloud/server.js';
import { TELEMETRY_UPLOAD_MAX_ROWS } from '../cloud/uploads/constants.js';
import { uploadQueuedDays, UploadRequestError } from './uploader.js';

import type { UploaderConfig } from './uploader.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Knex } from 'knex';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as Timers from 'node:timers/promises';

vi.mock('node:timers/promises', async () => {
    const actual: typeof Timers = await vi.importActual('node:timers/promises');
    return { ...actual, setTimeout: vi.fn(() => Promise.resolve()) };
});

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

/** A day with more rows than fit in one request. */
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

const run = (config: UploaderConfig, deadline = new Date(Date.now() + 60_000)) => uploadQueuedDays(config, { now, deadline });

const queued = async () => (await listQueuedUploads(knex, { since, schema: telemetry })).unwrap();

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
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(setTimeout).mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('uploadQueuedDays', () => {
    it('uploads every metric of each past day and skips today', async () => {
        const config = await uploader('past-days');
        await insert(
            { ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 },
            { ts: '2026-11-08T10:00:00Z', metric: connections, value: 40 },
            { ts: '2026-11-09T23:59:00Z', metric: concurrency, value: 5 },
            { ts: '2026-11-10T07:00:00Z', metric: concurrency, value: 7 }
        );

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 3, failed: 0, outOfTime: false });
        expect(vi.mocked(setTimeout).mock.calls).toEqual([[5_000], [5_000], [5_000]]);
        expect(await stored(config.installationId)).toEqual([
            { ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 },
            { ts: '2026-11-09 23:59:00.000', metric: concurrency, value: 5 },
            { ts: '2026-11-08 10:00:00.000', metric: connections, value: 40 }
        ]);
        expect(await queued()).toEqual([]);
    });

    it('does not upload days older than thirty days', async () => {
        const config = await uploader('backfill');
        await insert({ ts: '2026-10-10T10:00:00Z', metric: concurrency, value: 1 }, { ts: '2026-10-11T10:00:00Z', metric: concurrency, value: 2 });

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0, outOfTime: false });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-10-11 10:00:00.000', metric: concurrency, value: 2 }]);
    });

    it('marks an upload as failed, without sending it, once it is older than thirty days', async () => {
        const config = await uploader('expired');
        await insert({ ts: '2026-10-10T10:00:00Z', metric: concurrency });
        const whenItWasRecent = new Date('2026-10-12T08:00:00Z');
        await uploadQueuedDays({ ...config, url: 'http://127.0.0.1:1' }, { now: whenItWasRecent, deadline: new Date(Date.now() + 60_000) });
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 0, failed: 1, outOfTime: false });
        expect(requests).not.toHaveBeenCalled();
        expect(await stored(config.installationId)).toEqual([]);
    });

    it('does not upload the same day twice', async () => {
        const config = await uploader('once');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency });
        (await run(config)).unwrap();
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 0, failed: 0, outOfTime: false });
        expect(requests).not.toHaveBeenCalled();
    });

    it('uploads a day in several requests when it does not fit in one', async () => {
        const config = await uploader('paged');
        await insertBigDay(concurrency);
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0, outOfTime: false });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('continues a day from the last page Nango accepted', async () => {
        const config = await uploader('resumed');
        await insertBigDay(concurrency);
        const send = globalThis.fetch;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(globalThis, 'fetch').mockImplementationOnce(send).mockRejectedValue(new Error('socket hang up'));

        const interrupted = await run(config);

        expect(interrupted.isErr() && interrupted.error).toBeInstanceOf(UploadRequestError);
        expect(await stored(config.installationId)).toHaveLength(TELEMETRY_UPLOAD_MAX_ROWS);
        expect(await queued()).toMatchObject([{ day: '2026-11-08', metric: concurrency, cursor: { ts: expect.any(Date) } }]);

        vi.restoreAllMocks();
        const requests = vi.spyOn(globalThis, 'fetch');
        const resumed = await run(config);

        expect(resumed.unwrap()).toEqual({ succeeded: 1, failed: 0, outOfTime: false });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('stops when the run is out of time and continues on the next run', async () => {
        const config = await uploader('out-of-time');
        await insertBigDay(concurrency);
        const send = globalThis.fetch;
        const deadline = new Date(Date.now() + 60_000);
        vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (...args) => {
            const answer = await send(...args);
            deadline.setTime(0);
            return answer;
        });

        const stopped = await run(config, deadline);

        expect(stopped.unwrap()).toEqual({ succeeded: 0, failed: 0, outOfTime: true });
        expect(await stored(config.installationId)).toHaveLength(TELEMETRY_UPLOAD_MAX_ROWS);
        expect(await queued()).toMatchObject([{ day: '2026-11-08', metric: concurrency, cursor: { ts: expect.any(Date) } }]);

        expect((await run(config)).unwrap()).toEqual({ succeeded: 1, failed: 0, outOfTime: false });
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('marks an upload that Nango rejects as failed, does not retry it, and continues with the others', async () => {
        const config = await uploader('turned-down');
        const tooLong = 'm'.repeat(300);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: tooLong }, { ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 5 });

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 1, outOfTime: false });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 5 }]);
        expect(await queued()).toEqual([]);

        const requests = vi.spyOn(globalThis, 'fetch');
        expect((await run(config)).unwrap()).toEqual({ succeeded: 0, failed: 0, outOfTime: false });
        expect(requests).not.toHaveBeenCalled();
    });

    it('marks every upload as failed when Nango rejects the installation', async () => {
        const config = await uploader('unlicensed', { licensed: false });
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 0, failed: 2, outOfTime: false });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await queued()).toEqual([]);
    });

    it('retries within the same run when Nango is failing', async () => {
        const config = await uploader('second-attempt');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'insert_failed' } }, { status: 500 }));

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, failed: 0, outOfTime: false });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 }]);
    });

    it.each([
        ['after three attempts when Nango keeps failing', () => Response.json({ error: { code: 'insert_failed' } }, { status: 500 }), 3],
        ['right away on a clock skew', () => Response.json({ error: { code: 'clock_skew' } }, { status: 401 }), 1],
        ['right away on a 429', () => Response.json({ error: { code: 'too_many_requests' } }, { status: 429 }), 1],
        ['right away on a 404', () => Response.json({ error: { code: 'not_found' } }, { status: 404 }), 1],
        ['right away when a proxy rejects the request', () => new Response('Forbidden', { status: 403 }), 1]
    ])('stops the run and keeps the queue, %s', async (name, answer, attempts) => {
        const config = await uploader(`kept ${name}`);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(answer()));

        const res = await run(config);

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: answer().status });
        expect(requests).toHaveBeenCalledTimes(attempts);
        expect(await queued()).toHaveLength(2);
    });

    it('stops the run and keeps the queue, after three attempts when Nango cannot be reached', async () => {
        const config = { ...(await uploader('unreachable')), url: 'http://127.0.0.1:1' };
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: undefined, message: 'could not reach http://127.0.0.1:1' });
        expect(requests).toHaveBeenCalledTimes(3);
        expect(await queued()).toHaveLength(2);
    });
});

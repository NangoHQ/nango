import { gunzipSync } from 'node:zlib';

import { createClient } from '@clickhouse/client';
import knexFactory from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOSTED_TELEMETRY_TABLE, HOSTED_TELEMETRY_UPLOADS_TABLE, migrate as migrateTelemetry } from '@nangohq/hosted-telemetry';
import { ensureDailyPartitions } from '@nangohq/migrations';
import { Err, Ok } from '@nangohq/utils';

import { installationsClickhouseClient } from '../cloud/clickhouse/clickhouse.js';
import { migrate as migrateClickhouse } from '../cloud/clickhouse/migrate.js';
import { migrate as migrateRegistry } from '../cloud/db/migrate.js';
import { seedInstallation, seedLicense } from '../cloud/seeders/installation.seeder.js';
import { createCloudServer } from '../cloud/server.js';
import { TELEMETRY_UPLOAD_MAX_ROWS } from '../cloud/uploads/constants.js';
import { fillUploadQueue, uploadNextPage, UploadRequestError } from './uploader.js';

import type { TelemetryUploadHeader } from '../cloud/uploads/reader.js';
import type { UploaderConfig } from './uploader.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Result } from '@nangohq/utils';
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
async function insertBigDay(
    metric: string,
    { producers = 28, minutes = 1440, padding = 0 }: { producers?: number; minutes?: number; padding?: number } = {}
): Promise<void> {
    await knex.raw(
        `INSERT INTO ??.?? (ts, metric, attributes, value)
         SELECT '2026-11-08T00:00:00Z'::timestamptz + minute * interval '1 minute', ?, jsonb_build_object('producer_id', 'p' || producer || repeat('x', ?)), minute
         FROM generate_series(0, ? - 1) AS minute, generate_series(1, ?) AS producer`,
        [telemetry, HOSTED_TELEMETRY_TABLE, metric, padding, minutes, producers]
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

/** What each request told Nango, in the order they were sent. Needs a spy on fetch. */
const sent = () =>
    vi.mocked(globalThis.fetch).mock.calls.map(([, init]) => {
        const [header = '', ...rows] = gunzipSync(init?.body as Buffer)
            .toString()
            .split('\n');
        const { metric, from, to } = JSON.parse(header) as TelemetryUploadHeader;
        return { metric, from, to, rows: rows.length };
    });

/** What a replica does: fills the queue, then sends a page at a time until nothing is left or a page cannot be sent. */
async function run(config: UploaderConfig, loopStartedAt = now): Promise<Result<{ succeeded: number; rejected: number }>> {
    (await fillUploadQueue(config, { now })).unwrap();
    const done = { succeeded: 0, rejected: 0 };
    for (;;) {
        const step = await uploadNextPage(config, { rejectedBefore: loopStartedAt });
        if (step.isErr()) {
            return Err(step.error);
        }
        const { outcome } = step.value;
        if (outcome === 'idle') {
            return Ok(done);
        }
        done.succeeded += outcome === 'finished' ? 1 : 0;
        done.rejected += outcome === 'rejected' ? 1 : 0;
    }
}

async function uploads(status: 'queued' | 'succeeded' | 'failed'): Promise<{ day: string; metric: string; cursor_ts: Date | null }[]> {
    const res = await knex.raw<{ rows: { day: string; metric: string; cursor_ts: Date | null }[] }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, cursor_ts FROM ??.?? WHERE status = ? ORDER BY day, metric`,
        [telemetry, HOSTED_TELEMETRY_UPLOADS_TABLE, status]
    );
    return res.rows;
}
const queued = () => uploads('queued');

async function uploader(name: string, options?: { licensed?: boolean }): Promise<UploaderConfig & { id: number }> {
    const { id, uuid, privateKeyPem } = await seedInstallation({ knex, schema: registry }, name, options);
    return {
        id,
        knex,
        schema: telemetry,
        installationId: uuid,
        privateKeyPem,
        url,
        backfillDays: 30,
        metrics: [],
        licenseGraceUntil: new Date('2028-01-30T00:00:00Z')
    };
}

beforeAll(async () => {
    // The endpoint only accepts recent rows, so it has to read the same date as the uploader.
    vi.useFakeTimers({ toFake: ['Date'], now });

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
    vi.useRealTimers();
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
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('uploader', () => {
    it('uploads every metric of each past day and skips today', async () => {
        const config = await uploader('past-days');
        await insert(
            { ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 },
            { ts: '2026-11-08T10:00:00Z', metric: connections, value: 40 },
            { ts: '2026-11-09T23:59:00Z', metric: concurrency, value: 5 },
            { ts: '2026-11-10T07:00:00Z', metric: concurrency, value: 7 }
        );

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 3, rejected: 0 });
        expect(await stored(config.installationId)).toEqual([
            { ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 },
            { ts: '2026-11-09 23:59:00.000', metric: concurrency, value: 5 },
            { ts: '2026-11-08 10:00:00.000', metric: connections, value: 40 }
        ]);
        expect(await queued()).toEqual([]);
    });

    it('uploads a metric that has no rows that day, so Nango knows nothing is missing', async () => {
        const config = { ...(await uploader('quiet-metric')), backfillDays: 1, metrics: [concurrency, connections] };
        await insert({ ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 3 });
        vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 2, rejected: 0 });
        expect(sent()).toEqual([
            { metric: concurrency, from: '2026-11-09T00:00:00.000Z', to: '2026-11-10T00:00:00.000Z', rows: 1 },
            { metric: connections, from: '2026-11-09T00:00:00.000Z', to: '2026-11-10T00:00:00.000Z', rows: 0 }
        ]);
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 3 }]);
        expect(await queued()).toEqual([]);
    });

    it('tells Nango the range each page completes, ending a cut page at its last row', async () => {
        const config = await uploader('ranges');
        await insertBigDay(concurrency);
        vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(sent()).toEqual([
            { metric: concurrency, from: '2026-11-08T00:00:00.000Z', to: '2026-11-08T19:30:00.000Z', rows: TELEMETRY_UPLOAD_MAX_ROWS },
            { metric: concurrency, from: '2026-11-08T19:30:00.000Z', to: '2026-11-09T00:00:00.000Z', rows: BIG_DAY_ROWS - TELEMETRY_UPLOAD_MAX_ROWS }
        ]);
    });

    it('sends an upload without rows to complete a day whose last page was full', async () => {
        const config = await uploader('full-last-page');
        await insertBigDay(concurrency, { producers: 32, minutes: TELEMETRY_UPLOAD_MAX_ROWS / 32 });
        vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(sent()).toEqual([
            { metric: concurrency, from: '2026-11-08T00:00:00.000Z', to: '2026-11-08T17:03:00.000Z', rows: TELEMETRY_UPLOAD_MAX_ROWS },
            { metric: concurrency, from: '2026-11-08T17:03:00.000Z', to: '2026-11-09T00:00:00.000Z', rows: 0 }
        ]);
        expect(await stored(config.installationId)).toHaveLength(TELEMETRY_UPLOAD_MAX_ROWS);
    });

    it('does not upload days older than the configured number of days', async () => {
        const config = { ...(await uploader('backfill')), backfillDays: 1 };
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 1 }, { ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 2 });

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 2 }]);
    });

    it('does not queue a day until 15 minutes after it ended', async () => {
        const config = await uploader('settling');
        await insert({ ts: '2026-11-09T23:59:00Z', metric: concurrency });

        (await fillUploadQueue(config, { now: new Date('2026-11-10T00:14:59Z') })).unwrap();
        const before = await queued();
        (await fillUploadQueue(config, { now: new Date('2026-11-10T00:15:00Z') })).unwrap();

        expect(before).toEqual([]);
        expect(await queued()).toEqual([{ day: '2026-11-09', metric: concurrency, cursor_ts: null }]);
    });

    it('marks an upload as failed, without sending it, once it is older than the configured number of days', async () => {
        const config = await uploader('expired');
        await insert({ ts: '2026-10-10T10:00:00Z', metric: concurrency });
        (await fillUploadQueue(config, { now: new Date('2026-10-12T08:00:00Z') })).unwrap();
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 0, rejected: 0 });
        expect(requests).not.toHaveBeenCalled();
        expect(await uploads('failed')).toEqual([{ day: '2026-10-10', metric: concurrency, cursor_ts: null }]);
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
        expect(await queued()).toEqual([{ day: '2026-11-08', metric: concurrency, cursor_ts: new Date('2026-11-08T19:30:00Z') }]);

        vi.restoreAllMocks();
        const requests = vi.spyOn(globalThis, 'fetch');
        const resumed = await run(config);

        expect(resumed.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await stored(config.installationId)).toHaveLength(BIG_DAY_ROWS);
    });

    it('sends a day in several requests when its rows are under the row limit but too big for one request', async () => {
        const config = await uploader('heavy-rows');
        await insertBigDay(concurrency, { producers: 8, padding: 900 });
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toHaveLength(1440 * 8);
        expect(await queued()).toEqual([]);
    });

    it('sends every page once when two replicas upload at the same time', async () => {
        const config = { ...(await uploader('two-replicas')), backfillDays: 2, metrics: [concurrency, connections] };
        await insertBigDay(concurrency);
        await insertBigDay(connections);
        vi.spyOn(globalThis, 'fetch');

        const [one, other] = await Promise.all([run(config), run(config)]);

        expect(one.unwrap().succeeded + other.unwrap().succeeded).toBe(4);
        expect(sent().sort((a, b) => `${a.metric} ${a.from}`.localeCompare(`${b.metric} ${b.from}`))).toEqual(
            [concurrency, connections].flatMap((metric) => [
                { metric, from: '2026-11-08T00:00:00.000Z', to: '2026-11-08T19:30:00.000Z', rows: TELEMETRY_UPLOAD_MAX_ROWS },
                { metric, from: '2026-11-08T19:30:00.000Z', to: '2026-11-09T00:00:00.000Z', rows: BIG_DAY_ROWS - TELEMETRY_UPLOAD_MAX_ROWS },
                { metric, from: '2026-11-09T00:00:00.000Z', to: '2026-11-10T00:00:00.000Z', rows: 0 }
            ])
        );
        expect(await stored(config.installationId)).toHaveLength(2 * BIG_DAY_ROWS);
    });

    it('keeps an upload that Nango rejects in the queue, continues with the others, and does not send it again in the same loop', async () => {
        const config = await uploader('turned-down');
        const tooLong = 'm'.repeat(300);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: tooLong }, { ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 5 });

        (await fillUploadQueue(config, { now })).unwrap();
        const rejected = await uploadNextPage(config, { rejectedBefore: now });
        const res = await run(config);

        expect(rejected.unwrap()).toMatchObject({
            outcome: 'rejected',
            day: '2026-11-08',
            metric: tooLong,
            rejection: { status: 400, code: 'invalid_header' }
        });
        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 5 }]);
        expect(await queued()).toEqual([{ day: '2026-11-08', metric: tooLong, cursor_ts: null }]);

        const requests = vi.spyOn(globalThis, 'fetch');
        expect((await run(config)).unwrap()).toEqual({ succeeded: 0, rejected: 0 });
        expect(requests).not.toHaveBeenCalled();
    });

    it('sends a rejected upload again on the next loop, and uploads it once Nango accepts it', async () => {
        const config = await uploader('accepted-later');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 });
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'invalid_row' } }, { status: 400 }));

        const first = await run(config);
        const storedAfterFirst = await stored(config.installationId);
        const next = await run(config, new Date(now.getTime() + 60 * 60 * 1000));

        expect(first.unwrap()).toEqual({ succeeded: 0, rejected: 1 });
        expect(storedAfterFirst).toEqual([]);
        expect(next.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 }]);
        expect(await queued()).toEqual([]);
    });

    it('stops and keeps the queue when Nango does not accept the installation, and uploads once it does', async () => {
        const config = await uploader('unlicensed', { licensed: false });
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 2 }, { ts: '2026-11-09T10:00:00Z', metric: concurrency, value: 4 });
        const requests = vi.spyOn(globalThis, 'fetch');

        const res = await run(config);

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: 403, code: 'no_license' });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await queued()).toHaveLength(2);

        await seedLicense({ knex, schema: registry }, config.id);

        expect((await run(config)).unwrap()).toEqual({ succeeded: 2, rejected: 0 });
        expect(await stored(config.installationId)).toEqual([
            { ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 2 },
            { ts: '2026-11-09 10:00:00.000', metric: concurrency, value: 4 }
        ]);
    });

    it('retries the page right away when Nango is failing', async () => {
        const config = await uploader('second-attempt');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency, value: 3 });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ error: { code: 'insert_failed' } }, { status: 500 }));

        const res = await run(config);

        expect(res.unwrap()).toEqual({ succeeded: 1, rejected: 0 });
        expect(requests).toHaveBeenCalledTimes(2);
        expect(await stored(config.installationId)).toEqual([{ ts: '2026-11-08 10:00:00.000', metric: concurrency, value: 3 }]);
    });

    it('stops retrying a page once it has taken five minutes', async () => {
        const config = await uploader('slow-attempts');
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency });
        const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            vi.setSystemTime(now.getTime() + 5 * 60 * 1000);
            return Promise.resolve(Response.json({ error: { code: 'insert_failed' } }, { status: 500 }));
        });

        const res = await run(config);
        vi.setSystemTime(now);

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: 500 });
        expect(requests).toHaveBeenCalledTimes(1);
        expect(await queued()).toHaveLength(1);
    });

    it.each([
        ['after three attempts when Nango keeps failing', () => Response.json({ error: { code: 'insert_failed' } }, { status: 500 }), 3],
        ['right away on a 429', () => Response.json({ error: { code: 'too_many_requests' } }, { status: 429 }), 1],
        ['right away on a 404', () => Response.json({ error: { code: 'not_found' } }, { status: 404 }), 1],
        ['right away when a proxy rejects the request', () => new Response('Request Entity Too Large', { status: 413 }), 1]
    ])('stops and keeps the queue, %s', async (name, answer, attempts) => {
        const config = await uploader(`kept ${name}`);
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-09T10:00:00Z', metric: concurrency });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(answer()));

        const res = await run(config);

        expect(res.isErr() && res.error).toMatchObject({ name: 'UploadRequestError', status: answer().status });
        expect(requests).toHaveBeenCalledTimes(attempts);
        expect(await queued()).toHaveLength(2);
    });

    it('stops and keeps the queue, after three attempts when Nango cannot be reached', async () => {
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

import knexFactory from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ensureDailyPartitions } from '@nangohq/migrations';

import { migrate } from './migrate.js';
import { HOSTED_TELEMETRY_TABLE, HOSTED_TELEMETRY_UPLOADS_TABLE } from './schema.js';
import { enqueueUploads, failExpiredUploads, failUpload, listQueuedUploads, readUploadPage, saveUploadProgress } from './uploads.js';

import type { Knex } from 'knex';

const schema = 'hosted_telemetry_uploads_test';
const concurrency = 'nango.hosted_metric.active_concurrency.max';
const connections = 'nango.hosted_metric.connections.count';

let knex: Knex;

const at = (iso: string) => new Date(iso);
const today = at('2026-11-10T00:00:00Z');
const since = at('2026-11-07T00:00:00Z');

async function insert(...rows: { ts: string; metric: string; attributes?: Record<string, unknown>; value?: number }[]): Promise<void> {
    await knex
        .withSchema(schema)
        .table(HOSTED_TELEMETRY_TABLE)
        .insert(rows.map((row) => ({ ts: at(row.ts), metric: row.metric, attributes: row.attributes ?? {}, value: row.value ?? 1 })));
}

async function uploads(): Promise<{ day: string; metric: string; status: string }[]> {
    const res = await knex.raw<{ rows: { day: string; metric: string; status: string }[] }>(
        `SELECT day::text AS day, metric, status FROM ??.?? ORDER BY day, metric`,
        [schema, HOSTED_TELEMETRY_UPLOADS_TABLE]
    );
    return res.rows;
}

beforeAll(async () => {
    const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;
    knex = knexFactory({
        client: 'pg',
        connection: { connectionString: url },
        pool: {
            afterCreate: (conn: { query: (sql: string, done: (err: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) => {
                conn.query(`SET TIME ZONE 'Asia/Tokyo'`, (err) => done(err, conn));
            }
        }
    });
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    (await migrate({ knex, schema })).unwrap();
    (
        await ensureDailyPartitions({
            knex,
            schema,
            table: HOSTED_TELEMETRY_TABLE,
            dates: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((day) => at(`${day}T12:00:00Z`))
        })
    ).unwrap();
});

afterAll(async () => {
    await knex.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await knex.destroy();
});

beforeEach(async () => {
    await knex.raw('TRUNCATE ??.??, ??.??', [schema, HOSTED_TELEMETRY_TABLE, schema, HOSTED_TELEMETRY_UPLOADS_TABLE]);
});

describe('enqueueUploads', () => {
    it('queues every metric of each past day in the window, using UTC days', async () => {
        await insert(
            { ts: '2026-11-06T23:59:00Z', metric: concurrency },
            { ts: '2026-11-08T00:00:00Z', metric: concurrency },
            { ts: '2026-11-08T23:59:00Z', metric: connections },
            { ts: '2026-11-09T12:00:00Z', metric: concurrency, attributes: { producer_id: 'a' } },
            { ts: '2026-11-09T12:00:00Z', metric: concurrency, attributes: { producer_id: 'b' } },
            { ts: '2026-11-10T00:00:00Z', metric: concurrency }
        );

        (await enqueueUploads(knex, { since, today, schema })).unwrap();

        expect(await uploads()).toEqual([
            { day: '2026-11-08', metric: concurrency, status: 'queued' },
            { day: '2026-11-08', metric: connections, status: 'queued' },
            { day: '2026-11-09', metric: concurrency, status: 'queued' }
        ]);
    });

    it('does not queue a day twice', async () => {
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency });
        (await enqueueUploads(knex, { since, today, schema })).unwrap();
        (await saveUploadProgress(knex, { day: '2026-11-08', metric: concurrency, cursor: null, done: true, schema })).unwrap();
        await insert({ ts: '2026-11-08T11:00:00Z', metric: connections });

        (await enqueueUploads(knex, { since, today, schema })).unwrap();

        expect(await uploads()).toEqual([{ day: '2026-11-08', metric: concurrency, status: 'succeeded' }]);
    });
});

describe('listQueuedUploads', () => {
    it('lists the queued uploads, oldest first, with their cursor', async () => {
        await insert(
            { ts: '2026-11-08T10:00:00Z', metric: connections },
            { ts: '2026-11-08T10:00:00Z', metric: concurrency },
            { ts: '2026-11-09T10:00:00Z', metric: concurrency },
            { ts: '2026-11-07T10:00:00Z', metric: concurrency }
        );
        (await enqueueUploads(knex, { since, today, schema })).unwrap();
        const cursor = { ts: at('2026-11-08T10:00:00Z'), attributes: { producer_id: 'a' } };
        (await saveUploadProgress(knex, { day: '2026-11-08', metric: concurrency, cursor, done: false, schema })).unwrap();
        (await saveUploadProgress(knex, { day: '2026-11-07', metric: concurrency, cursor, done: true, schema })).unwrap();

        const queued = (await listQueuedUploads(knex, { schema })).unwrap();

        expect(queued).toEqual([
            { day: '2026-11-08', metric: concurrency, cursor },
            { day: '2026-11-08', metric: connections, cursor: null },
            { day: '2026-11-09', metric: concurrency, cursor: null }
        ]);
    });

    it('does not change an upload that already succeeded or failed', async () => {
        await insert({ ts: '2026-11-08T10:00:00Z', metric: concurrency }, { ts: '2026-11-08T10:00:00Z', metric: connections });
        (await enqueueUploads(knex, { since, today, schema })).unwrap();
        (await saveUploadProgress(knex, { day: '2026-11-08', metric: concurrency, cursor: null, done: true, schema })).unwrap();
        (await failUpload(knex, { day: '2026-11-08', metric: connections, schema })).unwrap();

        (await failUpload(knex, { day: '2026-11-08', metric: concurrency, schema })).unwrap();
        (await saveUploadProgress(knex, { day: '2026-11-08', metric: connections, cursor: null, done: true, schema })).unwrap();

        expect(await uploads()).toEqual([
            { day: '2026-11-08', metric: concurrency, status: 'succeeded' },
            { day: '2026-11-08', metric: connections, status: 'failed' }
        ]);
    });
});

describe('failExpiredUploads', () => {
    it('marks as failed only the queued uploads older than the window', async () => {
        await insert(
            { ts: '2026-11-07T10:00:00Z', metric: concurrency },
            { ts: '2026-11-07T10:00:00Z', metric: connections },
            { ts: '2026-11-08T10:00:00Z', metric: concurrency }
        );
        (await enqueueUploads(knex, { since, today, schema })).unwrap();
        (await saveUploadProgress(knex, { day: '2026-11-07', metric: connections, cursor: null, done: true, schema })).unwrap();

        const expired = await failExpiredUploads(knex, { since: at('2026-11-08T00:00:00Z'), schema });

        expect(expired.unwrap()).toBe(1);
        expect(await uploads()).toEqual([
            { day: '2026-11-07', metric: concurrency, status: 'failed' },
            { day: '2026-11-07', metric: connections, status: 'succeeded' },
            { day: '2026-11-08', metric: concurrency, status: 'queued' }
        ]);
    });
});

describe('readUploadPage', () => {
    it('reads a metric for one UTC day page by page, without repeating or skipping a row', async () => {
        await insert(
            { ts: '2026-11-07T23:59:00Z', metric: concurrency, value: 0 },
            { ts: '2026-11-08T00:00:00Z', metric: concurrency, attributes: { producer_id: 'a' }, value: 1 },
            { ts: '2026-11-08T00:01:00Z', metric: concurrency, attributes: { producer_id: 'b' }, value: 3 },
            { ts: '2026-11-08T00:01:00Z', metric: concurrency, attributes: { producer_id: 'a' }, value: 2 },
            { ts: '2026-11-08T23:59:00Z', metric: concurrency, attributes: { producer_id: 'a' }, value: 4 },
            { ts: '2026-11-08T00:00:00Z', metric: connections, value: 99 },
            { ts: '2026-11-09T00:00:00Z', metric: concurrency, value: 5 }
        );
        const read = async (cursor: Parameters<typeof readUploadPage>[1]['cursor']) =>
            (await readUploadPage(knex, { day: '2026-11-08', metric: concurrency, cursor, limit: 2, schema })).unwrap();

        const first = await read(null);
        const second = await read(first.at(-1)!);
        const third = await read(second.at(-1)!);

        expect(first).toEqual([
            { ts: at('2026-11-08T00:00:00Z'), metric: concurrency, attributes: { producer_id: 'a' }, value: 1 },
            { ts: at('2026-11-08T00:01:00Z'), metric: concurrency, attributes: { producer_id: 'a' }, value: 2 }
        ]);
        expect(second.map((row) => row.value)).toEqual([3, 4]);
        expect(third).toEqual([]);
    });
});

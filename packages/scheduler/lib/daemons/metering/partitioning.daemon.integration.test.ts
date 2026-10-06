import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDbClient } from '../../db/helpers.test.js';
import { up } from '../../db/migrations/20261002000000_create_concurrency_metrics.js';
import { ConcurrencyPartitioningDaemon } from './partitioning.daemon.js';

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

describe('ConcurrencyPartitioningDaemon.run', () => {
    const schema = 'scheduler_concurrency_partitions';
    const client = getTestDbClient(schema);
    const daemon = new ConcurrencyPartitioningDaemon({ db: client.db, schema, abortSignal: new AbortController().signal });

    async function partitionNames(): Promise<string[]> {
        const { rows } = await client.db.raw<{ rows: { name: string }[] }>(
            `SELECT c.relname AS name
             FROM pg_partition_tree(format('%I.concurrency_metrics', ?::text)::regclass) p
             JOIN pg_class c ON c.oid = p.relid
             WHERE p.isleaf ORDER BY c.relname`,
            [schema]
        );
        return rows.map(({ name }) => name);
    }

    beforeEach(async () => {
        await client.db.raw('CREATE SCHEMA ??', [schema]);
        await up(client.db);
    });
    afterEach(async () => {
        await client.clearDatabase();
    });
    afterAll(async () => {
        await client.destroy();
    });

    it('creates YYYYMMDD partitions for today and tomorrow across the UTC year boundary', async () => {
        const now = new Date('2026-12-31T23:30:00Z');
        await daemon.run(now);
        expect(await partitionNames()).toEqual(['concurrency_metrics_20261231', 'concurrency_metrics_20270101']);

        // Repeated maintenance does not recreate existing partitions.
        await daemon.run(now);
        expect(await partitionNames()).toEqual(['concurrency_metrics_20261231', 'concurrency_metrics_20270101']);
    });

    it('uses a custom retention period', async () => {
        const shortRetentionDaemon = new ConcurrencyPartitioningDaemon({ db: client.db, schema, abortSignal: new AbortController().signal, retentionDays: 7 });
        await shortRetentionDaemon.run(new Date('2026-10-01T12:00:00Z'));
        await shortRetentionDaemon.run(new Date('2026-10-09T00:00:00Z'));
        expect(await partitionNames()).toEqual(['concurrency_metrics_20261002', 'concurrency_metrics_20261009', 'concurrency_metrics_20261010']);
    });

    it('stores one observation per environment and bucket', async () => {
        const now = new Date('2026-10-07T12:00:00Z');
        await daemon.run(now);
        const observation = {
            bucket_start: now,
            active_concurrency: 1
        };
        const table = () => client.db('concurrency_metrics');
        await table().insert([
            { ...observation, environment_id: 0 },
            { ...observation, environment_id: 1 }
        ]);
        expect(await table().select('environment_id').orderBy('environment_id')).toEqual([{ environment_id: 0 }, { environment_id: 1 }]);
        await expect(table().insert({ ...observation, environment_id: 1 })).rejects.toMatchObject({ code: PG_UNIQUE_VIOLATION }); // observations must be unique per bucket and environment_id.
        await expect(table().insert({ ...observation, environment_id: -2 })).rejects.toMatchObject({ code: PG_CHECK_VIOLATION }); // environment_ids must be >= -1 (-1 = tasks without an environment).
    });

    it('drops only wholly expired partitions, including missed cleanup after downtime', async () => {
        await daemon.run(new Date('2026-10-01T12:00:00Z'));
        await daemon.run(new Date('2026-10-03T12:00:00Z'));

        await daemon.run(new Date('2026-11-02T12:00:00Z'));
        // The cutoff falls within Oct 3: keep that entire day, but drop Oct 1 and Oct 2.
        expect(await partitionNames()).toEqual([
            'concurrency_metrics_20261003',
            'concurrency_metrics_20261004',
            'concurrency_metrics_20261102',
            'concurrency_metrics_20261103'
        ]);

        await daemon.run(new Date('2026-11-03T00:00:00Z'));
        expect(await partitionNames()).toEqual([
            'concurrency_metrics_20261004',
            'concurrency_metrics_20261102',
            'concurrency_metrics_20261103',
            'concurrency_metrics_20261104'
        ]);
    });
});

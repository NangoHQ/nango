import { envs } from '../env.js';
import { installationsClickhouseClient } from './clickhouse/clickhouse.js';
import { migrate as migrateClickhouse } from './clickhouse/migrate.js';
import { bookkeeperDaemon } from './daemons/bookkeeper.daemon.js';
import { cloudDb } from './db/client.js';
import { migrate } from './db/migrate.js';

import type { RegistryDb } from './services/db.js';
import type { ClickHouseClient } from '@clickhouse/client';

export async function boot(): Promise<{ db: RegistryDb; clickhouse: ClickHouseClient; bookkeeper: ReturnType<typeof bookkeeperDaemon> }> {
    if (!envs.CLICKHOUSE_URL) {
        throw new Error('CLICKHOUSE_URL is required to store what installations upload');
    }
    const knex = cloudDb();
    const migration = await migrate({ knex });
    if (migration.isErr()) {
        throw migration.error;
    }
    const clickhouse = await migrateClickhouse({ clickhouseUrl: envs.CLICKHOUSE_URL });
    if (clickhouse.isErr()) {
        throw clickhouse.error;
    }
    const db = { knex };
    return { db, clickhouse: installationsClickhouseClient(envs.CLICKHOUSE_URL), bookkeeper: bookkeeperDaemon(db) };
}

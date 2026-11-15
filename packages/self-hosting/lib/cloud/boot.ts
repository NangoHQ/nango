import { envs } from '../env.js';
import { migrate as migrateClickhouse } from './clickhouse/migrate.js';
import { cloudDb } from './db/client.js';
import { migrate } from './db/migrate.js';

export async function boot(): Promise<void> {
    if (!envs.CLICKHOUSE_URL) {
        throw new Error('CLICKHOUSE_URL is required to store what installations upload');
    }
    const migration = await migrate({ knex: cloudDb() });
    if (migration.isErr()) {
        throw migration.error;
    }
    const clickhouse = await migrateClickhouse({ clickhouseUrl: envs.CLICKHOUSE_URL });
    if (clickhouse.isErr()) {
        throw clickhouse.error;
    }
}

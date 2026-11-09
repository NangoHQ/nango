import { envs } from '../env.js';
import { migrate as migrateClickhouse } from './clickhouse/migrate.js';
import { cloudDb } from './db/client.js';
import { migrate } from './db/migrate.js';

export async function boot(): Promise<void> {
    const migration = await migrate({ knex: cloudDb() });
    if (migration.isErr()) {
        throw migration.error;
    }
    const clickhouse = await migrateClickhouse({ clickhouseUrl: envs.CLICKHOUSE_URL });
    if (clickhouse.isErr()) {
        throw clickhouse.error;
    }
}

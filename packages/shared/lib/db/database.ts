import knex from 'knex';
import type { Knex } from 'knex';
import { metrics, retry } from '@nangohq/utils';
import type { Pool } from 'tarn';

export function getDbConfig({ timeoutMs }: { timeoutMs: number }): Knex.Config {
    return {
        client: process.env['NANGO_DB_CLIENT'] || 'pg',
        connection: process.env['NANGO_DATABASE_URL'] || {
            host: process.env['NANGO_DB_HOST'] || (process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'nango-db' : 'localhost'),
            port: +(process.env['NANGO_DB_PORT'] || 5432),
            user: process.env['NANGO_DB_USER'] || 'nango',
            database: process.env['NANGO_DB_NAME'] || 'nango',
            password: process.env['NANGO_DB_PASSWORD'] || 'nango',
            ssl: process.env['NANGO_DB_SSL'] != null && process.env['NANGO_DB_SSL'].toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined,
            statement_timeout: timeoutMs
        },
        pool: {
            min: parseInt(process.env['NANGO_DB_POOL_MIN'] || '2'),
            max: parseInt(process.env['NANGO_DB_POOL_MAX'] || '50')
        },
        // SearchPath needs the current db and public because extension can only be installed once per DB
        searchPath: ['nango', 'public']
    };
}

export class KnexDatabase {
    knex: Knex;

    constructor({ timeoutMs } = { timeoutMs: 60000 }) {
        const dbConfig = getDbConfig({ timeoutMs });
        this.knex = knex(dbConfig);
    }

    /**
     * Not enabled by default because shared is imported by everything
     */
    enableMetrics() {
        if (process.env['CI']) {
            return;
        }

        const pool = this.knex.client.pool as Pool<any>;
        const acquisitionMap = new Map<number, number>();

        setInterval(() => {
            metrics.gauge(metrics.Types.DB_POOL_USED, pool.numUsed());
            metrics.gauge(metrics.Types.DB_POOL_FREE, pool.numFree());
            metrics.gauge(metrics.Types.DB_POOL_WAITING, pool.numPendingAcquires());
        }, 1000);
        setInterval(() => {
            // We want to avoid storing orphan too long, it's alright if we loose some metrics
            acquisitionMap.clear();
        }, 60000);

        pool.on('acquireRequest', (evtId) => {
            acquisitionMap.set(evtId, Date.now());
        });
        pool.on('acquireSuccess', (evtId) => {
            const evt = acquisitionMap.get(evtId);
            if (!evt) {
                return;
            }

            metrics.duration(metrics.Types.DB_POOL_ACQUISITION_DURATION, Date.now() - evt);
            acquisitionMap.delete(evtId);
        });
    }

    async migrate(directory: string): Promise<any> {
        return retry(async () => await this.knex.migrate.latest({ directory: directory, tableName: '_nango_auth_migrations', schemaName: this.schema() }), {
            maxAttempts: 4,
            delayMs: (attempt) => 500 * attempt,
            retryIf: () => true
        });
    }

    schema() {
        return 'nango';
    }
}

const db = new KnexDatabase();

export default db;

export { db as database };

export const schema = (): Knex.QueryBuilder => db.knex.queryBuilder();

export const dbNamespace = '_nango_';

export const multipleMigrations = async (): Promise<void> => {
    try {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);

        const [_, pendingMigrations] = await db.knex.migrate.list({
            directory: String(process.env['NANGO_DB_MIGRATION_FOLDER'])
        });

        if (pendingMigrations.length === 0) {
            console.log('No pending migrations, skipping migration step.');
        } else {
            console.log('Migrations pending, running migrations.');
            await db.knex.migrate.latest({
                directory: String(process.env['NANGO_DB_MIGRATION_FOLDER'])
            });
            console.log('Migrations completed.');
        }
    } catch (error: any) {
        console.error(error.message || error);
    }
};

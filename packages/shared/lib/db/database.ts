import knex from 'knex';
import type { Knex } from 'knex';

function getDbConfig({ timeoutMs }: { timeoutMs: number }): Knex.Config<any> {
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
            max: parseInt(process.env['NANGO_DB_POOL_MAX'] || '7')
        }
    };
}

export class KnexDatabase {
    knex: Knex;

    constructor({ timeoutMs } = { timeoutMs: 60000 }) {
        const dbConfig = getDbConfig({ timeoutMs });
        this.knex = knex(dbConfig);
    }

    async migrate(directory: string): Promise<any> {
        return this.knex.migrate.latest({ directory: directory, tableName: '_nango_auth_migrations', schemaName: this.schema() });
    }

    schema() {
        return 'nango';
    }
}

const db = new KnexDatabase();

export default db;

export { db as database };

export const schema = (): Knex.QueryBuilder => db.knex.withSchema(db.schema());

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
        console.error(error?.message);
    }
};

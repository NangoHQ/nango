import knex from 'knex';
import type { Knex } from 'knex';
import { config } from './config.js';

class KnexDatabase {
    knex: Knex;

    constructor() {
        const dbConfig = config.development;
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
};

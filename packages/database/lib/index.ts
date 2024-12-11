import path from 'node:path';
import knex from 'knex';
import type { Knex } from 'knex';
import { projectRoot, retry } from '@nangohq/utils';
import { defaultSchema, getDbConfig } from './getConfig.js';

// Note: we are in dist when it executes but migrations are not compiled
const directory = path.join(projectRoot, 'packages/database/lib/migrations');

export class KnexDatabase {
    knex: Knex;

    constructor({ timeoutMs } = { timeoutMs: 60000 }) {
        const dbConfig = getDbConfig({ timeoutMs });
        this.knex = knex(dbConfig);
    }

    async migrate(): Promise<any> {
        return retry(
            async () =>
                await this.knex.migrate.latest({
                    directory: directory,
                    tableName: '_nango_auth_migrations',
                    schemaName: this.schema()
                }),
            {
                maxAttempts: 4,
                delayMs: (attempt) => 500 * attempt,
                retryIf: () => true
            }
        );
    }

    schema() {
        return defaultSchema;
    }
}

const db = new KnexDatabase();

export default db;

export { db as database };

export const schema = (): Knex.QueryBuilder => db.knex.queryBuilder();

export const dbNamespace = '_nango_';

export type { Knex };

export const multipleMigrations = async (): Promise<void> => {
    try {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);

        const [_, pendingMigrations] = await db.knex.migrate.list({
            directory
        });

        if (pendingMigrations.length === 0) {
            console.log('No pending migrations, skipping migration step.');
        } else {
            console.log('Migrations pending, running migrations.');
            await db.knex.migrate.latest({
                directory
            });
            console.log('Migrations completed.');
        }
    } catch (err: any) {
        console.error(err.message || err);
    }
};

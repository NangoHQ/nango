import { knex } from 'knex';

import { isTest } from '@nangohq/utils';

import { migrate } from './migrate.js';

export const testDb = {
    schema: 'keystore_test',
    init: async (): Promise<knex.Knex> => {
        const url = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`;
        const knexConfig = {
            client: 'postgres',
            connection: {
                connectionString: url,
                statement_timeout: 60000
            },
            searchPath: testDb.schema,
            pool: { min: 2, max: 10 }
        };
        const db = knex(knexConfig);
        await migrate(db, testDb.schema);
        return db;
    },
    clear: async (db: knex.Knex) => {
        if (isTest) {
            await db.raw(`DROP SCHEMA IF EXISTS ${testDb.schema} CASCADE`);
        }
    }
};

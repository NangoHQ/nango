import knex from 'knex';

import { envs } from '../../env.js';
import { SELF_HOSTING_SCHEMA } from './schema.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

export function cloudDb(): Knex {
    if (!instance) {
        if (!envs.NANGO_SELF_HOSTING_DATABASE_URL) {
            throw new Error('NANGO_SELF_HOSTING_DATABASE_URL is required to run the registry');
        }
        instance = knex({
            client: 'pg',
            connection: {
                connectionString: envs.NANGO_SELF_HOSTING_DATABASE_URL,
                ssl: envs.NANGO_SELF_HOSTING_DATABASE_SSL ? { rejectUnauthorized: false } : false,
                statement_timeout: 60_000,
                application_name: envs.NANGO_DB_APPLICATION_NAME
            },
            searchPath: SELF_HOSTING_SCHEMA,
            pool: { min: 0, max: envs.NANGO_SELF_HOSTING_DB_POOL_MAX, acquireTimeoutMillis: 60_000, createTimeoutMillis: 10_000 }
        });
    }
    return instance;
}

export async function destroyCloudDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}

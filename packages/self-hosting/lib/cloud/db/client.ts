import knex from 'knex';

import { envs } from '../../env.js';
import { SELF_HOSTING_SCHEMA } from './schema.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

export function cloudDb(): Knex {
    instance ??= knex({
        client: 'pg',
        connection: {
            connectionString:
                envs.NANGO_DATABASE_URL ??
                `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`,
            ssl: envs.NANGO_DB_SSL ? { rejectUnauthorized: false } : false,
            statement_timeout: 60_000,
            application_name: envs.NANGO_DB_APPLICATION_NAME
        },
        searchPath: SELF_HOSTING_SCHEMA,
        pool: { min: 0, max: envs.NANGO_SELF_HOSTING_DB_POOL_MAX, acquireTimeoutMillis: 60_000, createTimeoutMillis: 10_000 }
    });
    return instance;
}

export async function destroyCloudDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}

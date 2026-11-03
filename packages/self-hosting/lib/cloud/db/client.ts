import knex from 'knex';

import { getDbConfig } from '@nangohq/database';

import { envs } from '../../env.js';
import { SELF_HOSTING_SCHEMA } from './schema.js';

import type { Knex } from 'knex';

let instance: Knex | undefined;

export function cloudDb(): Knex {
    if (!instance) {
        const config = getDbConfig({ timeoutMs: 60_000 });
        instance = knex({ ...config, searchPath: SELF_HOSTING_SCHEMA, pool: { ...config.pool, min: 0, max: envs.NANGO_SELF_HOSTING_DB_POOL_MAX } });
    }
    return instance;
}

export async function destroyCloudDb(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}

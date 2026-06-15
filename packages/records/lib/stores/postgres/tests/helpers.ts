import knex from 'knex';

import { envs } from '../../../env.js';
import { makePostgresConfig } from '../config.js';

const schema = envs.RECORDS_DATABASE_SCHEMA;
export const testConfig = makePostgresConfig({
    databaseUrl: envs.RECORDS_DATABASE_URL!,
    schema,
    statementTimeout: envs.RECORDS_DATABASE_STATEMENT_TIMEOUT_MS,
    ssl: envs.RECORDS_DATABASE_SSL,
    applicationName: 'tests',
    pool: {
        min: envs.RECORDS_DATABASE_POOL_MIN,
        max: envs.RECORDS_DATABASE_POOL_MAX
    }
});
const db = knex(testConfig);

// WARNING: to use only in tests
export async function clearDb(): Promise<void> {
    await db.raw(`DROP SCHEMA ${schema} CASCADE`);
}

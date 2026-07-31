import { envs } from '../../../env.js';
import { makePostgresConfig } from '../config.js';

// Dedicated schema, distinct from envs.RECORDS_DATABASE_SCHEMA: this suite truncates its
// tables between tests, which would corrupt other integration test files (e.g. sync.integration.test.ts
// in packages/jobs) sharing the default schema if run concurrently (fileParallelism).
const schema = 'nango_records_postgres_store_test';
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

import { envs } from '../env.js';
import { makePostgresConfig } from '../stores/postgres/config.js';
import { PostgresStore } from '../stores/postgres/postgres.js';

export const records2Store: PostgresStore | undefined = (() => {
    if (!envs.RECORDS_2_DATABASE_URL) {
        return undefined;
    }
    const opts = {
        databaseUrl: envs.RECORDS_2_DATABASE_URL,
        schema: envs.RECORDS_2_DATABASE_SCHEMA,
        statementTimeout: envs.RECORDS_DATABASE_STATEMENT_TIMEOUT_MS,
        ssl: envs.RECORDS_2_DATABASE_SSL,
        applicationName: envs.NANGO_DB_APPLICATION_NAME,
        pool: {
            min: envs.RECORDS_DATABASE_POOL_MIN,
            max: envs.RECORDS_DATABASE_POOL_MAX
        }
    };

    const readWriteConfig = makePostgresConfig(opts);
    const readOnlyConfig = envs.RECORDS_2_DATABASE_READ_URL
        ? makePostgresConfig({
              ...opts,
              databaseUrl: envs.RECORDS_2_DATABASE_READ_URL
          })
        : undefined;
    return new PostgresStore(readWriteConfig, readOnlyConfig);
})();

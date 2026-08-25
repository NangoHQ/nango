import { envs } from '../env.js';
import { makePostgresConfig } from '../stores/postgres/config.js';
import { PostgresStore } from '../stores/postgres/postgres.js';

const databaseUrl =
    envs.RECORDS_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?application_name=${envs.NANGO_DB_APPLICATION_NAME}`;

const opts = {
    databaseUrl,
    schema: envs.RECORDS_DATABASE_SCHEMA,
    statementTimeout: envs.RECORDS_DATABASE_STATEMENT_TIMEOUT_MS,
    ssl: envs.RECORDS_DATABASE_SSL,
    applicationName: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]',
    pool: {
        min: envs.RECORDS_DATABASE_POOL_MIN,
        max: envs.RECORDS_DATABASE_POOL_MAX
    }
};

const readWriteConfig = makePostgresConfig(opts);
const readOnlyConfig = envs.RECORDS_DATABASE_READ_URL
    ? makePostgresConfig({
          ...opts,
          databaseUrl: envs.RECORDS_DATABASE_READ_URL
      })
    : undefined;

export const defaultStore = new PostgresStore(readWriteConfig, readOnlyConfig);

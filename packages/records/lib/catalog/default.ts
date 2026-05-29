import { envs } from '../env.js';
import { PostgresStore } from '../stores/postgres/postgres.js';

import type { Knex } from 'knex';

export const schema = envs.RECORDS_DATABASE_SCHEMA;

const databaseUrl =
    envs.RECORDS_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?application_name=${envs.NANGO_DB_APPLICATION_NAME}`;
const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

export const config: Knex.Config & { migrations: Knex.MigratorConfig } = {
    client: 'postgres',
    connection: {
        connectionString: databaseUrl,
        statement_timeout: envs.RECORDS_DATABASE_STATEMENT_TIMEOUT_MS,
        ssl: envs.RECORDS_DATABASE_SSL ? { rejectUnauthorized: false } : false,
        application_name: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]'
    },
    searchPath: schema,
    pool: { min: envs.RECORDS_DATABASE_POOL_MIN, max: envs.RECORDS_DATABASE_POOL_MAX },
    migrations: {
        extension: isJS ? 'js' : 'ts',
        directory: 'migrations',
        tableName: 'migrations',
        loadExtensions: [isJS ? '.js' : '.ts'],
        schemaName: schema
    }
};

// Optional — avoids opening two pools to the same URL
const configRead: Knex.Config | undefined = envs.RECORDS_DATABASE_READ_URL
    ? {
          ...config,
          connection: {
              connectionString: envs.RECORDS_DATABASE_READ_URL,
              statement_timeout: 60000,
              application_name: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]'
          }
      }
    : undefined;

let defaultStore: PostgresStore | undefined;

export const getDefaultStore = (): PostgresStore => {
    if (!defaultStore) {
        defaultStore = new PostgresStore(config, configRead);
        // The implicit daemon startup is an intentional design choice to preserve abstraction boundaries
        // Extracting startDaemon() would leak postgres-specific implementation details
        defaultStore.startDaemon();
    }
    return defaultStore;
};

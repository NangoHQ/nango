import { envs } from '../env.js';

import type { Knex } from 'knex';

export const schema = envs.RECORDS_DATABASE_SCHEMA;
const databaseUrl =
    envs.RECORDS_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?application_name=${envs.NANGO_DB_APPLICATION_NAME}`;
const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

const config: Knex.Config = {
    client: 'postgres',
    connection: {
        connectionString: databaseUrl,
        statement_timeout: 60000,
        application_name: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]'
    },
    searchPath: schema,
    pool: { min: 2, max: 50 },
    migrations: {
        extension: isJS ? 'js' : 'ts',
        directory: 'migrations',
        tableName: 'migrations',
        loadExtensions: [isJS ? '.js' : '.ts'],
        schemaName: schema
    }
};

// This config is optional because it can create issues if we have 2 pools connected to the same URL
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

export { config, configRead };

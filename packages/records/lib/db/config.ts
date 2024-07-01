import { envs } from '../env.js';
import type { Knex } from 'knex';

export const schema = envs.RECORDS_DATABASE_SCHEMA;
const databaseUrl =
    envs.RECORDS_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${envs.NANGO_DB_USER}:${envs.NANGO_DB_PASSWORD}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;
const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

const config: Knex.Config = {
    client: 'postgres',
    connection: {
        connectionString: databaseUrl,
        statement_timeout: 60000
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

export { config };

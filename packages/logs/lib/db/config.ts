import { envs } from '../env.js';
import type { Knex } from 'knex';

const url =
    envs.NANGO_LOGS_DB_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgresql://${envs.NANGO_DB_USER}:${envs.NANGO_DB_PASSWORD}@${envs.NANGO_DB_HOST || (envs.SERVER_RUN_MODE === 'DOCKERIZED' ? 'nango-db' : 'localhost')}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}?${envs.NANGO_DB_SSL === 'true' ? 'ssl=true' : ''}`;

export const schema = 'logs';
const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

const config: Knex.Config = {
    client: 'postgres',
    connection: url,
    searchPath: schema,
    pool: { min: 2, max: 20 },
    migrations: {
        extension: isJS ? 'js' : 'ts',
        directory: 'migrations',
        disableTransactions: true,
        tableName: 'migrations',
        loadExtensions: [isJS ? '.js' : '.ts'],
        schemaName: schema
    }
};

export { config };

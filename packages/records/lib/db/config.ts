import { envs } from '../env.js';
import type { Knex } from 'knex';

export const schema = 'nango_records';
const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

const config: Knex.Config = {
    client: 'postgres',
    connection: {
        connectionString: envs.RECORDS_DATABASE_URL,
        statement_timeout: 60000,
        ssl: 'no-verify' // RDS CA cert is self-signed and not in the CA store
    },
    searchPath: schema,
    pool: { min: 2, max: 20 },
    migrations: {
        extension: isJS ? 'js' : 'ts',
        directory: 'migrations',
        tableName: 'migrations',
        loadExtensions: [isJS ? '.js' : '.ts'],
        schemaName: schema
    }
};

export { config };

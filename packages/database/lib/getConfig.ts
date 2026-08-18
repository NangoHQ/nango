import type { Knex } from 'knex';

import { patchPgConnectForEmbedded } from './embedded.js';

export const defaultSchema = process.env['NANGO_DB_SCHEMA'] || 'nango';
const additionalSchemas = process.env['NANGO_DB_ADDITIONAL_SCHEMAS']
    ? process.env['NANGO_DB_ADDITIONAL_SCHEMAS'].split(',').map((schema: string) => schema.trim())
    : [];

export function getDbConfig({ timeoutMs }: { timeoutMs: number }): Knex.Config {
    patchPgConnectForEmbedded();
    const host = process.env['NANGO_DB_HOST'] || (process.env['SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'nango-db' : 'localhost');
    const url =
        process.env['NANGO_DATABASE_URL'] ||
        `postgres://${encodeURIComponent(process.env['NANGO_DB_USER'] || 'nango')}:${encodeURIComponent(process.env['NANGO_DB_PASSWORD'] || 'nango')}@${host}:${+(process.env['NANGO_DB_PORT'] || (process.env['NANGO_EMBEDDED_DB'] ? 5433 : 5432))}/${process.env['NANGO_DB_NAME'] || 'nango'}`;

    return {
        client: process.env['NANGO_DB_CLIENT'] || 'pg',
        connection: {
            connectionString: url,
            ssl: process.env['NANGO_DB_SSL'] != null && process.env['NANGO_DB_SSL'].toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
            statement_timeout: timeoutMs,
            application_name: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]'
        },
        pool: {
            min: parseInt(process.env['NANGO_DB_POOL_MIN'] || '0'),
            max: parseInt(process.env['NANGO_DB_POOL_MAX'] || '30'),
            acquireTimeoutMillis: timeoutMs || 30000,
            // cold-starting the embedded postgres (initdb) can take a few seconds
            createTimeoutMillis: process.env['NANGO_EMBEDDED_DB'] ? 60000 : 10000
        },
        // SearchPath needs the current db and public because extension can only be installed once per DB
        searchPath: [defaultSchema, 'public', ...additionalSchemas]
    };
}

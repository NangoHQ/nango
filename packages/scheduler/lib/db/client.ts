import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';

import { isTest } from '@nangohq/utils';

import { logger } from '../utils/logger.js';

import type { ConnectionConfig } from 'pg';

const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

export type DatabaseClientSslOption = NonNullable<ConnectionConfig['ssl']>;

export interface DatabaseClientOptions {
    url: string;
    schema: string;
    poolMin: number;
    poolMax: number;
    ssl: DatabaseClientSslOption;
    applicationName: string;
    statementTimeoutMs: number;
}

export const defaultDatabaseClientOptions = {
    poolMin: 2,
    poolMax: 50,
    ssl: false as DatabaseClientSslOption,
    applicationName: '[unknown]',
    statementTimeoutMs: 60_000
} satisfies Omit<DatabaseClientOptions, 'url' | 'schema'>;

export class DatabaseClient {
    public db: knex.Knex;
    public schema: string;
    public url: string;
    private config: knex.Knex.Config;

    constructor({ url, schema, poolMin, poolMax, ssl, applicationName, statementTimeoutMs }: DatabaseClientOptions) {
        this.url = url;
        this.schema = schema;
        this.config = {
            client: 'postgres',
            connection: {
                connectionString: url,
                ssl,
                statement_timeout: statementTimeoutMs,
                application_name: applicationName
            },
            searchPath: schema,
            pool: { min: poolMin, max: poolMax },
            migrations: {
                extension: isJS ? 'js' : 'ts',
                directory: 'migrations',
                tableName: 'migrations',
                loadExtensions: [isJS ? '.js' : '.ts'],
                schemaName: schema
            }
        };
        this.db = knex(this.config);
    }

    async destroy() {
        await this.db.destroy();
    }

    async migrate(): Promise<void> {
        logger.info('[scheduler] migration');

        const filename = fileURLToPath(import.meta.url);
        const dirname = path.dirname(path.join(filename, '../../'));
        const dir = path.join(dirname, 'dist/db/migrations');

        // Migrations can run longer than the runtime statement timeout, so run them on a dedicated
        // connection with no statement_timeout. (This is also the no-timeout migration path.)
        const migrationDb = knex({
            ...this.config,
            connection: { ...(this.config.connection as object), statement_timeout: 0 }
        } as knex.Knex.Config);
        try {
            // `??` quotes the schema as an identifier — never interpolate it into raw SQL directly.
            await migrationDb.raw('CREATE SCHEMA IF NOT EXISTS ??', [this.schema]);

            const [, pendingMigrations] = (await migrationDb.migrate.list({ ...this.config.migrations, directory: dir })) as [unknown, string[]];

            if (pendingMigrations.length === 0) {
                logger.info('[scheduler] nothing to do');
                return;
            }

            await migrationDb.migrate.latest({ ...this.config.migrations, directory: dir });
            logger.info('[scheduler] migrations completed.');
        } finally {
            await migrationDb.destroy();
        }
    }

    /*********************************/
    /* WARNING: to use only in tests */
    /*********************************/
    async clearDatabase(): Promise<void> {
        if (isTest) {
            await this.db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [this.schema]);
        }
    }
}

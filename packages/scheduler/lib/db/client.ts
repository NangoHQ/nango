import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';

import { isTest } from '@nangohq/utils';

import { logger } from '../utils/logger.js';

const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

export interface DatabaseClientOptions {
    url: string;
    schema: string;
    poolMin?: number;
    poolMax?: number;
    ssl?: boolean;
    applicationName?: string;
    statementTimeoutMs?: number;
}

export class DatabaseClient {
    public db: knex.Knex;
    public schema: string;
    public url: string;
    private config: knex.Knex.Config;

    constructor({ url, schema, poolMin = 2, poolMax = 50, ssl = false, applicationName = '[unknown]', statementTimeoutMs = 60000 }: DatabaseClientOptions) {
        this.url = url;
        this.schema = schema;
        this.config = {
            client: 'postgres',
            connection: {
                connectionString: url,
                ssl: ssl ? { rejectUnauthorized: false } : false,
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
        await this.db.raw(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);

        const [, pendingMigrations] = (await this.db.migrate.list({ ...this.config.migrations, directory: dir })) as [unknown, string[]];

        if (pendingMigrations.length === 0) {
            logger.info('[scheduler] nothing to do');
            return;
        }

        await this.db.migrate.latest({ ...this.config.migrations, directory: dir });
        logger.info('[scheduler] migrations completed.');
    }

    /*********************************/
    /* WARNING: to use only in tests */
    /*********************************/
    async clearDatabase(): Promise<void> {
        if (isTest) {
            await this.db.raw(`DROP SCHEMA IF EXISTS ${this.schema} CASCADE`);
        }
    }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';

import { isTest } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../utils/logger.js';

const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
const isJS = !runningMigrationOnly;

export class DatabaseClient {
    public db: knex.Knex;
    public schema: string;
    public url: string;
    private config: knex.Knex.Config;

    constructor({ url, schema, poolMax = envs.FLEET_DB_POOL_MAX }: { url: string; schema: string; poolMax?: number }) {
        this.url = url;
        this.schema = schema;
        this.config = {
            client: 'postgres',
            connection: {
                connectionString: url,
                statement_timeout: 60000,
                application_name: process.env['NANGO_DB_APPLICATION_NAME'] || '[unknown]'
            },
            searchPath: schema,
            pool: { min: 0, max: poolMax, idleTimeoutMillis: 5000 },
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
        try {
            logger.info(`[fleet - ${this.schema}] migration`);

            const filename = fileURLToPath(import.meta.url);
            const dirname = path.dirname(path.join(filename, '../../'));
            const dir = path.join(dirname, 'dist/db/migrations');
            await this.db.raw(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);

            const [, pendingMigrations] = (await this.db.migrate.list({ ...this.config.migrations, directory: dir })) as [unknown, string[]];

            if (pendingMigrations.length === 0) {
                logger.info(`[fleet - ${this.schema}] nothing to do`);
                return;
            }

            await this.db.migrate.latest({ ...this.config.migrations, directory: dir });
            logger.info(`[fleet - ${this.schema}] migrations completed.`);
        } catch (err) {
            if (err instanceof Error && err.name === 'MigrationLocked') {
                logger.info(`[fleet - ${this.schema}] migrations already locked, skipping`);
                return;
            }
            throw err;
        }
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

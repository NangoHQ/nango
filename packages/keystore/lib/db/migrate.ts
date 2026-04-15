import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../utils/logger.js';

import type knex from 'knex';

export async function migrate(db: knex.Knex, migrationSchema: string = 'migrations'): Promise<void> {
    logger.info('[keystore] migration');

    const runningMigrationOnly = process.argv.some((v) => v === 'migrate:latest');
    const isJS = !runningMigrationOnly;
    const migrationsConfig = {
        extension: isJS ? 'js' : 'ts',
        directory: 'migrations',
        schemaName: migrationSchema,
        tableName: 'migrations_keystore',
        loadExtensions: [isJS ? '.js' : '.ts']
    };

    const filename = fileURLToPath(import.meta.url);
    const dirname = path.dirname(path.join(filename, '../../'));
    const dir = path.join(dirname, 'dist/db/migrations');

    await db.raw(`CREATE SCHEMA IF NOT EXISTS ${migrationSchema}`);
    const [, pendingMigrations] = (await db.migrate.list({ ...migrationsConfig, directory: dir })) as [unknown, string[]];
    if (pendingMigrations.length === 0) {
        logger.info('[keystore] nothing to do');
        return;
    }

    await db.migrate.latest({ ...migrationsConfig, directory: dir });
    logger.info('[keystore] migrations completed.');
}

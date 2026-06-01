import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../../utils/logger.js';
import { config, schema } from './config.js';

import type { Knex } from 'knex';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(path.join(filename, '../../../../'));

export async function migrate(db: Knex): Promise<void> {
    logger.info('[records] migration');
    const dir = path.join(dirname, 'records/dist/stores/postgres/migrations');
    await db.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    const [, pendingMigrations] = (await db.migrate.list({ ...config.migrations, directory: dir })) as [unknown, string[]];

    if (pendingMigrations.length === 0) {
        logger.info('[records] nothing to do');
        return;
    }

    await db.migrate.latest({ ...config.migrations, directory: dir });
    logger.info('[records] migrations completed.');
}

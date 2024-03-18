import { logger } from '@nangohq/shared';
import { db } from './client';
import { schema } from './config';
import { dirname } from '../env';
import path from 'node:path';

export async function migrate(): Promise<void> {
    logger.info('[logs] migration');
    const dir = path.join(dirname, 'logs/dist/db/migrations');
    await db.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    const [_, pendingMigrations] = await db.migrate.list({ directory: dir });

    if (pendingMigrations.length === 0) {
        logger.info('[logs] nothing to do');
        return;
    }

    await db.migrate.latest({ directory: dir });
    logger.info('[logs] migrations completed.');
}

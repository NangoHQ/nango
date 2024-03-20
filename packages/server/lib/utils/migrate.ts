import path from 'node:path';
import logger from '../utils/logger.js';
import { encryptionManager, KnexDatabase } from '@nangohq/shared';
import { dirname } from './utils.js';

const MIGRATION_FOLDER = process.env['NANGO_DB_MIGRATION_FOLDER'];

export default async function migrate() {
    const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
    const pathMigrations = path.join(dirname(), '../../../shared/lib/db/migrations');
    logger.info(`Migrating database ... ${pathMigrations}`);

    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate(MIGRATION_FOLDER || pathMigrations);
    await encryptionManager.encryptDatabaseIfNeeded();

    logger.info('✅ Migrated database');
}

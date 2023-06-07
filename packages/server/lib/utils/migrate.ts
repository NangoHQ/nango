import Logger from '../utils/logger.js';
import { db, encryptionManager } from '@nangohq/shared';

export default async function migrate() {
    Logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate(process.env['NANGO_DB_MIGRATION_FOLDER'] || '../shared/lib/db/migrations');
    await encryptionManager.encryptDatabaseIfNeeded();
    Logger.info('✅ Migrated database');
}

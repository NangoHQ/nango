import db from '../db/database.js';
import path from 'path';
import { dirname } from '../utils/utils.js';
import Logger from '../utils/logger.js';
import { encryptionManager } from '@nangohq/shared';

export default async function migrate() {
    Logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate(path.join(dirname(), '../../lib/db/migrations'));
    await encryptionManager.encryptDatabaseIfNeeded();
    Logger.info('✅ Migrated database');
}

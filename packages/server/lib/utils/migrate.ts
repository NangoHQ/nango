import Logger from '@nangohq/utils/dist/logger.js';

const { logger } = new Logger('Server');

import { encryptionManager, KnexDatabase } from '@nangohq/shared';

export default async function migrate() {
    const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
    logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate(process.env['NANGO_DB_MIGRATION_FOLDER'] || '../shared/lib/db/migrations');
    await encryptionManager.encryptDatabaseIfNeeded();
    logger.info('✅ Migrated database');
}

import { getLogger } from '@nangohq/utils';

const logger = getLogger('Server');

import { encryptionManager } from '@nangohq/shared';
import { KnexDatabase } from '@nangohq/database';

export default async function migrate() {
    const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
    logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate(process.env['NANGO_DB_MIGRATION_FOLDER'] || '../database/lib/migrations');
    await encryptionManager.encryptDatabaseIfNeeded();
    logger.info('✅ Migrated database');
}

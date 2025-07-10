import { encryptionManager } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import type { KnexDatabase } from '@nangohq/database';

const logger = getLogger('Server');

export default async function migrate(db: KnexDatabase): Promise<void> {
    logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate();
    await encryptionManager.encryptDatabaseIfNeeded();
    logger.info('✅ Migrated database');
}

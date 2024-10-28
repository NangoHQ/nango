import { getLogger } from '@nangohq/utils';

const logger = getLogger('Server');

import { encryptionManager } from '@nangohq/shared';
import type { KnexDatabase } from '@nangohq/database';

export default async function migrate(db: KnexDatabase): Promise<void> {
    logger.info('Migrating database ...');
    await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
    await db.migrate();
    await encryptionManager.encryptDatabaseIfNeeded();
    logger.info('✅ Migrated database');
}

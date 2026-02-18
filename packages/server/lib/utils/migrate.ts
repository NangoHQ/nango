import { encryptionManager } from '@nangohq/shared';
import { getLogger, retry } from '@nangohq/utils';

import type { KnexDatabase } from '@nangohq/database';

const logger = getLogger('Server');

export default async function migrate(db: KnexDatabase): Promise<void> {
    logger.info('Migrating database ...');
    await retry(
        async () => {
            await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
            await db.migrate();
        },
        {
            maxAttempts: 5,
            delayMs: (attempt) => 1000 * attempt,
            retryOnError: (error) => error.name === 'KnexTimeoutError' || error.message.includes('Timeout acquiring a connection')
        }
    );
    await encryptionManager.encryptDatabaseIfNeeded();
    logger.info('✅ Migrated database');
}

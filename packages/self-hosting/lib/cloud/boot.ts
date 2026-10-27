import db from '@nangohq/database';

import { logger } from '../utils.js';
import { migrate } from './db/migrate.js';

export async function boot(): Promise<void> {
    const migration = await migrate({ knex: db.knex });
    if (migration.isErr()) {
        logger.error('Self-hosting database migration failed', migration.error);
        throw migration.error;
    }
}

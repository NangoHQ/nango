import db from '@nangohq/database';

import { migrate } from './db/migrate.js';

export async function boot(): Promise<void> {
    const migration = await migrate({ knex: db.knex });
    if (migration.isErr()) {
        throw migration.error;
    }
}

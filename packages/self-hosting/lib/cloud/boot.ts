import { cloudDb } from './db/client.js';
import { migrate } from './db/migrate.js';

export async function boot(): Promise<void> {
    const migration = await migrate({ knex: cloudDb() });
    if (migration.isErr()) {
        throw migration.error;
    }
}

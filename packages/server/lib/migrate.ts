import { KnexDatabase } from '@nangohq/database';
import migrate from './utils/migrate.js';
import { start as migrateLogs } from '@nangohq/logs';
import { migrate as migrateRecords } from '@nangohq/records';
import { migrate as migrateKeystore } from '@nangohq/keystore';

const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
await migrate(db);
await migrateKeystore(db.knex, db.schema());
await migrateLogs();
await migrateRecords();

process.exit(0);

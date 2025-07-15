import { KnexDatabase } from '@nangohq/database';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { start as migrateLogs } from '@nangohq/logs';
import { migrate as migrateRecords } from '@nangohq/records';

import migrate from './utils/migrate.js';

const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
await migrate(db);
await migrateKeystore(db.knex);
await migrateLogs();
await migrateRecords();

process.exit(0);

import { migratePostgres as migrateAudit } from '@nangohq/audit';
import { KnexDatabase } from '@nangohq/database';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { start as migrateLogs } from '@nangohq/logs';
import { records } from '@nangohq/records';

import { auditDb, destroyAuditDb, isSelfHostedAuditTrailEnabled } from './auditDb.js';
import { envs } from './env.js';
import { tasks } from './tasks/index.js';
import migrate from './utils/migrate.js';

const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
await migrate(db);
await migrateKeystore(db.knex);
await migrateLogs();
await records.migrate();
await tasks.migrate();
if (isSelfHostedAuditTrailEnabled(envs.AUDIT_DATABASE_URL)) {
    (await migrateAudit({ knex: auditDb(envs.AUDIT_DATABASE_URL) })).unwrap();
    await destroyAuditDb();
}

process.exit(0);

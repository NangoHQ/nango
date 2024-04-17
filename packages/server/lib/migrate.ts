import migrate from './utils/migrate.js';
import { migrate as migrateRecords } from '@nangohq/records';

await migrate();
await migrateRecords();
process.exit(0);

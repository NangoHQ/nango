import migrate from './utils/migrate.js';
import { start as migrateLogs } from '@nangohq/logs';

await migrate();
await migrateLogs();

process.exit(0);

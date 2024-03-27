import { migrateMapping } from '@nangohq/nango-logs';
import migrate from './utils/migrate.js';

await migrate();
await migrateMapping();

process.exit(0);

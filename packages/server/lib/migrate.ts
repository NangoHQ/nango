import migrate from './utils/migrate.js';

/**
 * This file is used to run migration only
 * https://github.com/NangoHQ/nango/pull/663/files
 */
await migrate();
process.exit(0);

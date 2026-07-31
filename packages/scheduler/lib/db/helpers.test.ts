import { randomUUID } from 'node:crypto';

import { DatabaseClient, defaultDatabaseClientOptions } from './client.js';

// Unique schema per client: test files run concurrently (fileParallelism), and a shared schema
// would let one file's migrate() race another's, or its clearDatabase() (DROP SCHEMA CASCADE)
// tear the schema down while another file is still using it.
export const getTestDbClient = () =>
    new DatabaseClient({
        ...defaultDatabaseClientOptions,
        url: `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`,
        schema: `scheduler_test_${randomUUID().replace(/-/g, '')}`
    });

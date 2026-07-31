import { DatabaseClient, defaultDatabaseClientOptions } from './client.js';

// Every suite passes its own schema. `migrate()` creates it and `clearDatabase()` drops it,
// so sharing one means a teardown in one file destroys the schema another file is still using.
export const getTestDbClient = (schema: string) =>
    new DatabaseClient({
        ...defaultDatabaseClientOptions,
        url: `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`,
        schema
    });

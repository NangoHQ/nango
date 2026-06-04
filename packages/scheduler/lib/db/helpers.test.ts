import { DatabaseClient, defaultDatabaseClientOptions } from './client.js';

export const getTestDbClient = () =>
    new DatabaseClient({
        ...defaultDatabaseClientOptions,
        url: `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`,
        schema: 'scheduler'
    });

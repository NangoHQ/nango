import { DatabaseClient } from './client.js';

export const testDbUrl = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}`;

export const getTestDbClient = (schema: string) =>
    new DatabaseClient({
        url: testDbUrl,
        schema
    });

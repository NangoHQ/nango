import { DatabaseClient } from './client.js';

export const getTestDbClient = () =>
    new DatabaseClient({
        url: `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`,
        schema: 'scheduler'
    });

export const rndStr = (length: number = 5) => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

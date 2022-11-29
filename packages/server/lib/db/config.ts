import type { Knex } from 'knex';

let config: { development: Knex.Config<any>; production: Knex.Config<any> } = {
    development: {
        client: 'pg',
        connection: {
            host: process.env['PIZZLY_DB_HOST'] || (process.env['PIZZLY_SERVER_RUN_MODE'] === 'DOCKERIZED' ? 'nango-db' : 'localhost'),
            port: process.env['PIZZLY_DB_PORT'] != null ? +process.env['PIZZLY_DB_PORT'] : 5432,
            user: process.env['PIZZLY_DB_USER'] || 'nango',
            database: process.env['PIZZLY_DB_NAME'] || 'nango',
            password: process.env['PIZZLY_DB_PASSWORD'] || 'nango',
            ssl: process.env['PIZZLY_DB_SSL'] ? { rejectUnauthorized: false } : undefined
        },
        migrations: {
            directory: './migrations',
            extension: 'ts'
        }
    },

    production: {}
};

export { config };

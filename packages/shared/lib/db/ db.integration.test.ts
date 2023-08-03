import { expect, describe, it } from 'vitest';
import db from '../db/database.js';

describe('Migration test', async () => {
    it('Should run migrations successfully', async () => {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
        await db.knex.migrate.latest({
            directory: String(process.env['NANGO_DB_MIGRATION_FOLDER'])
        });

        console.log('Database is migrated and ready');
        expect(true).toBe(true);
    });
});

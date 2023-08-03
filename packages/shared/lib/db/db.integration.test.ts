import { expect, describe, it } from 'vitest';
import { multipleMigrations } from '../db/database.js';

describe('Migration test', async () => {
    it('Should run migrations successfully', async () => {
        await multipleMigrations();

        console.log('Database is migrated and ready');
        expect(true).toBe(true);
    });
});

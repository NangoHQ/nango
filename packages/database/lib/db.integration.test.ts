import { expect, describe, it } from 'vitest';
import { multipleMigrations } from './index.js';

describe('Migration test', () => {
    it('Should run migrations successfully', async () => {
        await multipleMigrations();

        console.log('Database is migrated and ready');
        expect(true).toBe(true);
    });
});

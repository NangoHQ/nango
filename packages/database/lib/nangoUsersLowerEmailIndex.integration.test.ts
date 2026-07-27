import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from './index.js';

const require = createRequire(import.meta.url);
const { INDEX_NAME, createNangoUsersLowerEmailIndex } = require('./migration-helpers/nangoUsersLowerEmailIndex.cjs');

async function createAccount(): Promise<number> {
    const [account] = await db
        .knex('_nango_accounts')
        .insert({ name: `test-account-${randomUUID()}` })
        .returning('id');
    return account.id;
}

async function insertUser(email: string, accountId: number): Promise<void> {
    await db.knex('_nango_users').insert({
        email,
        name: 'test',
        account_id: accountId,
        email_verified: true,
        role: 'administrator'
    });
}

async function indexExists(): Promise<boolean> {
    const row = await db.knex('pg_indexes').select('indexname').where({ indexname: INDEX_NAME }).first();
    return Boolean(row);
}

describe('nango_users lower(email) unique index', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        // Keep the shared db singleton open for other test files.
    });

    it('enforces case-insensitive email uniqueness', async () => {
        expect(await indexExists()).toBe(true);

        const accountId = await createAccount();
        const local = `Alice-${randomUUID()}`;
        await insertUser(`${local}@Example.com`, accountId);

        await expect(insertUser(`${local.toLowerCase()}@example.com`, accountId)).rejects.toThrow();
    });

    it('skips creation and warns when case-insensitive duplicates already exist', async () => {
        await db.knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);

        const accountId = await createAccount();
        const local = `Dup-${randomUUID()}`;
        await insertUser(`${local}@Example.com`, accountId);
        await insertUser(`${local.toLowerCase()}@example.com`, accountId);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            await createNangoUsersLowerEmailIndex(db.knex);
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }

        expect(await indexExists()).toBe(false);

        await db
            .knex('_nango_users')
            .whereRaw('lower(email) = ?', [`${local.toLowerCase()}@example.com`])
            .delete();
        await createNangoUsersLowerEmailIndex(db.knex);
        expect(await indexExists()).toBe(true);
    });
});

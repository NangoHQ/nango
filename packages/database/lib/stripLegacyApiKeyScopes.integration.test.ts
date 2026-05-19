import { randomUUID } from 'crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripLegacyApiKeyScopes } = require('./migration-helpers/stripLegacyApiKeyScopes.cjs');

async function createKey({ scopes, deletedAt }: { scopes: string[]; deletedAt?: Date }): Promise<{ id: number; accountId: number }> {
    const [account] = await db
        .knex('_nango_accounts')
        .insert({ name: `test-account-${randomUUID()}` })
        .returning('id');
    const unique = randomUUID();
    const [row] = await db
        .knex('customer_keys')
        .insert({
            account_id: account.id,
            key_type: 'api',
            display_name: 'test',
            scopes,
            secret: unique,
            iv: 'test-iv',
            tag: 'test-tag',
            hashed: `hashed-${unique}`,
            deleted_at: deletedAt ?? null
        })
        .returning('id');
    return { id: row.id, accountId: account.id };
}

async function readScopes(id: number): Promise<string[]> {
    const row = await db.knex('customer_keys').select('scopes').where({ id }).first();
    return row.scopes ?? [];
}

describe('stripLegacyApiKeyScopes', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        // Keep the shared db singleton open for other test files.
    });

    it('removes environment:integrations:write while keeping the new scopes', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:integrations:create', 'environment:integrations:update', 'environment:integrations:delete']
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:integrations:create', 'environment:integrations:update', 'environment:integrations:delete'].sort()
        );
    });

    it('removes environment:connections:write', async () => {
        const key = await createKey({
            scopes: ['environment:connections:write', 'environment:connections:create']
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:connections:create']);
    });

    it('removes environment:syncs:manage', async () => {
        const key = await createKey({
            scopes: ['environment:syncs:manage', 'environment:syncs:update', 'environment:syncs:variant:create', 'environment:syncs:variant:delete']
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:syncs:update', 'environment:syncs:variant:create', 'environment:syncs:variant:delete'].sort()
        );
    });

    it('removes environment:config:read and environment:config:*', async () => {
        const key = await createKey({
            scopes: ['environment:config:read', 'environment:config:*', 'environment:variables:read', 'environment:integrations:list_functions']
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(['environment:variables:read', 'environment:integrations:list_functions'].sort());
    });

    it('removes all 5 legacy scopes from a key that has every one of them', async () => {
        const key = await createKey({
            scopes: [
                'environment:integrations:write',
                'environment:connections:write',
                'environment:syncs:manage',
                'environment:config:read',
                'environment:config:*',
                'environment:proxy'
            ]
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:proxy']);
    });

    it('is idempotent on consecutive runs', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:integrations:create']
        });

        await stripLegacyApiKeyScopes(db.knex);
        const after1 = await readScopes(key.id);

        await stripLegacyApiKeyScopes(db.knex);
        const after2 = await readScopes(key.id);

        expect(after2.sort()).toEqual(after1.sort());
    });

    it('also strips soft-deleted keys', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:integrations:create'],
            deletedAt: new Date()
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:integrations:create']);
    });

    it('does not touch keys without legacy scopes', async () => {
        const key = await createKey({ scopes: ['environment:*'] });

        await stripLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:*']);
    });

    it('preserves unrelated scopes', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:proxy', 'environment:records:read']
        });

        await stripLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(['environment:proxy', 'environment:records:read'].sort());
    });

    it('handles empty scopes array (no-op)', async () => {
        const key = await createKey({ scopes: [] });

        await stripLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual([]);
    });
});

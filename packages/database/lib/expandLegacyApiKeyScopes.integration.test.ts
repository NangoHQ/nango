import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { expandLegacyApiKeyScopes } = require('./migration-helpers/expandLegacyApiKeyScopes.cjs');

let accountSeq = 9_000_000;

async function createAccount(): Promise<number> {
    accountSeq += 1;
    const id = accountSeq;
    await db.knex('_nango_accounts').insert({ id, name: `test-acct-${id}` });
    return id;
}

async function createKey({ scopes, deletedAt }: { scopes: string[]; deletedAt?: Date }): Promise<{ id: number; accountId: number }> {
    const accountId = await createAccount();
    const [row] = await db
        .knex('customer_keys')
        .insert({
            account_id: accountId,
            key_type: 'api',
            display_name: 'test',
            scopes,
            secret: 'secret',
            iv: '',
            tag: '',
            hashed: `hashed-${accountId}-${Date.now()}-${Math.random()}`,
            deleted_at: deletedAt ?? null
        })
        .returning('id');
    return { id: row.id, accountId };
}

async function readScopes(id: number): Promise<string[]> {
    const row = await db.knex('customer_keys').select('scopes').where({ id }).first();
    return row.scopes ?? [];
}

describe('expandLegacyApiKeyScopes', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        await db.knex.destroy();
    });

    beforeEach(async () => {
        await db.knex('customer_keys').where('account_id', '>=', 9_000_000).delete();
        await db.knex('_nango_accounts').where('id', '>=', 9_000_000).delete();
    });

    it('expands environment:integrations:write to create/update/delete', async () => {
        const key = await createKey({ scopes: ['environment:integrations:write'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:integrations:write', 'environment:integrations:create', 'environment:integrations:update', 'environment:integrations:delete'].sort()
        );
    });

    it('expands environment:connections:write to create/update/delete', async () => {
        const key = await createKey({ scopes: ['environment:connections:write'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:connections:write', 'environment:connections:create', 'environment:connections:update', 'environment:connections:delete'].sort()
        );
    });

    it('expands environment:syncs:manage to update/variant:create/variant:delete', async () => {
        const key = await createKey({ scopes: ['environment:syncs:manage'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:syncs:manage', 'environment:syncs:update', 'environment:syncs:variant:create', 'environment:syncs:variant:delete'].sort()
        );
    });

    it('expands environment:config:read to variables:read and integrations:list_functions', async () => {
        const key = await createKey({ scopes: ['environment:config:read'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:config:read', 'environment:variables:read', 'environment:integrations:list_functions'].sort()
        );
    });

    it('expands environment:config:* to variables:read and integrations:list_functions', async () => {
        const key = await createKey({ scopes: ['environment:config:*'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:config:*', 'environment:variables:read', 'environment:integrations:list_functions'].sort()
        );
    });

    it('does not duplicate scopes when both legacy and new already present', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:integrations:create']
        });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            ['environment:integrations:write', 'environment:integrations:create', 'environment:integrations:update', 'environment:integrations:delete'].sort()
        );
    });

    it('is idempotent on consecutive runs', async () => {
        const key = await createKey({ scopes: ['environment:integrations:write'] });

        await expandLegacyApiKeyScopes(db.knex);
        const after1 = await readScopes(key.id);

        await expandLegacyApiKeyScopes(db.knex);
        const after2 = await readScopes(key.id);

        expect(after2.sort()).toEqual(after1.sort());
    });

    it('does not touch soft-deleted keys', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write'],
            deletedAt: new Date()
        });

        await expandLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:integrations:write']);
    });

    it('does not touch keys without legacy scopes', async () => {
        const key = await createKey({ scopes: ['environment:*'] });

        await expandLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:*']);
    });

    it('handles multiple legacy scopes on the same key', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:syncs:manage']
        });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            [
                'environment:integrations:write',
                'environment:integrations:create',
                'environment:integrations:update',
                'environment:integrations:delete',
                'environment:syncs:manage',
                'environment:syncs:update',
                'environment:syncs:variant:create',
                'environment:syncs:variant:delete'
            ].sort()
        );
    });

    it('preserves unrelated scopes untouched', async () => {
        const key = await createKey({
            scopes: ['environment:integrations:write', 'environment:proxy', 'environment:records:read']
        });

        await expandLegacyApiKeyScopes(db.knex);

        expect((await readScopes(key.id)).sort()).toEqual(
            [
                'environment:integrations:write',
                'environment:integrations:create',
                'environment:integrations:update',
                'environment:integrations:delete',
                'environment:proxy',
                'environment:records:read'
            ].sort()
        );
    });

    it('handles empty scopes array (no-op)', async () => {
        const key = await createKey({ scopes: [] });

        await expandLegacyApiKeyScopes(db.knex);

        expect(await readScopes(key.id)).toEqual([]);
    });
});

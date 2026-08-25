import { randomUUID } from 'crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NEW_SCOPE, OLD_SCOPE, renameDryrunApiKeyScope } = require('./migration-helpers/renameDryrunApiKeyScope.cjs');

async function createKey({
    scopes,
    keyType = 'api',
    deletedAt
}: {
    scopes: string[] | null;
    keyType?: 'api' | 'webhook_signing';
    deletedAt?: Date;
}): Promise<{ id: number; accountId: number }> {
    const [account] = await db
        .knex('_nango_accounts')
        .insert({ name: `test-account-${randomUUID()}` })
        .returning('id');
    const unique = randomUUID();
    const [row] = await db
        .knex('customer_keys')
        .insert({
            account_id: account.id,
            key_type: keyType,
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

async function readScopes(id: number): Promise<string[] | null> {
    const row = await db.knex('customer_keys').select('scopes').where({ id }).first();
    return row.scopes;
}

describe('renameDryrunApiKeyScope', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        // Keep the shared db singleton open for other test files.
    });

    it('renames environment:dryrun to environment:functions:dryrun', async () => {
        const key = await createKey({ scopes: [OLD_SCOPE] });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toEqual([NEW_SCOPE]);
    });

    it('dedupes keys that already have both dryrun scopes', async () => {
        const key = await createKey({ scopes: ['environment:records:read', OLD_SCOPE, NEW_SCOPE] });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:records:read', NEW_SCOPE]);
    });

    it('is idempotent on consecutive runs', async () => {
        const key = await createKey({ scopes: ['environment:proxy', OLD_SCOPE] });

        await renameDryrunApiKeyScope(db.knex);
        const after1 = await readScopes(key.id);

        await renameDryrunApiKeyScope(db.knex);
        const after2 = await readScopes(key.id);

        expect(after2).toEqual(after1);
    });

    it('also renames soft-deleted API keys', async () => {
        const key = await createKey({ scopes: [OLD_SCOPE], deletedAt: new Date() });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toEqual([NEW_SCOPE]);
    });

    it('does not touch keys without the old dryrun scope', async () => {
        const key = await createKey({ scopes: ['environment:*'] });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toEqual(['environment:*']);
    });

    it('does not touch non-API keys', async () => {
        const key = await createKey({ keyType: 'webhook_signing', scopes: [OLD_SCOPE] });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toEqual([OLD_SCOPE]);
    });

    it('handles null scopes as a no-op', async () => {
        const key = await createKey({ scopes: null });

        await renameDryrunApiKeyScope(db.knex);

        expect(await readScopes(key.id)).toBeNull();
    });
});

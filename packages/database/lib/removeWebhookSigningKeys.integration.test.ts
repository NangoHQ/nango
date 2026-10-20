import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

const require = createRequire(import.meta.url);
const { copyNewerWebhookSigningKeys, deleteWebhookSigningCustomerKeys } = require('./migration-helpers/removeWebhookSigningKeys.cjs');

const older = new Date('2024-01-02T03:04:05.000Z');
const newer = new Date('2024-06-07T08:09:10.000Z');

async function createAccount(): Promise<number> {
    const [account] = await db
        .knex('_nango_accounts')
        .insert({ name: `test-account-${randomUUID()}` })
        .returning('id');
    return account.id;
}

async function createEnvironment(accountId: number, deleted = false): Promise<number> {
    const [env] = await db
        .knex('_nango_environments')
        .insert({ account_id: accountId, name: `env-${randomUUID()}`, deleted, deleted_at: deleted ? new Date() : null })
        .returning('id');
    return env.id;
}

async function createLegacyKey(accountId: number, environmentId: number | null, secret: string, updatedAt: Date, deletedAt: Date | null = null): Promise<void> {
    const [key] = await db
        .knex('customer_keys')
        .insert({
            account_id: accountId,
            key_type: 'webhook_signing',
            display_name: 'Webhook signing',
            scopes: null,
            secret,
            iv: `iv-${secret}`,
            tag: `tag-${secret}`,
            hashed: `hashed-${randomUUID()}`,
            created_at: older,
            updated_at: updatedAt,
            deleted_at: deletedAt
        })
        .returning('id');
    if (environmentId !== null) {
        await db.knex('customer_keys_relations').insert({
            customer_key_id: key.id,
            entity_type: 'environment',
            entity_id: environmentId
        });
    }
}

async function insertSigningKey(environmentId: number, secret: string, updatedAt: Date): Promise<void> {
    await db.knex('webhook_signing_keys').insert({
        environment_id: environmentId,
        secret,
        iv: `iv-${secret}`,
        tag: `tag-${secret}`,
        created_at: older,
        updated_at: updatedAt
    });
}

async function signingKey(environmentId: number): Promise<{ secret: string; updated_at: Date } | undefined> {
    return db.knex('webhook_signing_keys').select('secret', 'updated_at').where({ environment_id: environmentId }).first();
}

async function allowWebhookSigningKeyType(): Promise<void> {
    await db.knex.raw(`ALTER TABLE customer_keys DROP CONSTRAINT IF EXISTS check_customer_keys_key_type`);
    await db.knex.raw(`
        ALTER TABLE customer_keys
            ADD CONSTRAINT check_customer_keys_key_type
            CHECK (key_type IN ('api', 'webhook_signing')) NOT VALID
    `);
    await db.knex.raw(`ALTER TABLE customer_keys VALIDATE CONSTRAINT check_customer_keys_key_type`);
}

async function narrowCustomerKeyTypeToApi(): Promise<void> {
    await db.knex.raw(`ALTER TABLE customer_keys DROP CONSTRAINT IF EXISTS check_customer_keys_key_type`);
    await db.knex.raw(`
        ALTER TABLE customer_keys
            ADD CONSTRAINT check_customer_keys_key_type
            CHECK (key_type IN ('api')) NOT VALID
    `);
    await db.knex.raw(`ALTER TABLE customer_keys VALIDATE CONSTRAINT check_customer_keys_key_type`);
}

describe('removeWebhookSigningKeys', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await allowWebhookSigningKeyType();
    });

    afterAll(async () => {
        await db.knex('customer_keys').where({ key_type: 'webhook_signing' }).delete();
        await narrowCustomerKeyTypeToApi();
    });

    it('copies a newer legacy secret and keeps its timestamp', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId);
        await insertSigningKey(environmentId, 'current', older);
        await createLegacyKey(accountId, environmentId, 'legacy', newer);

        await copyNewerWebhookSigningKeys(db.knex);

        const row = await signingKey(environmentId);
        expect(row?.secret).toBe('legacy');
        expect(new Date(row!.updated_at).toISOString()).toBe(newer.toISOString());
    });

    it('leaves the new row when the legacy secret is older or the same age', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId);
        await insertSigningKey(environmentId, 'current', newer);
        await createLegacyKey(accountId, environmentId, 'legacy', newer);

        await copyNewerWebhookSigningKeys(db.knex);

        const row = await signingKey(environmentId);
        expect(row?.secret).toBe('current');
        expect(new Date(row!.updated_at).toISOString()).toBe(newer.toISOString());
    });

    it('keeps the newest legacy secret when the new row is missing', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId);
        await createLegacyKey(accountId, environmentId, 'older-legacy', older);
        await createLegacyKey(accountId, environmentId, 'newer-legacy', newer);

        await copyNewerWebhookSigningKeys(db.knex);

        const row = await signingKey(environmentId);
        expect(row?.secret).toBe('newer-legacy');
        expect(new Date(row!.updated_at).toISOString()).toBe(newer.toISOString());
    });

    it('copies a signing key for a soft-deleted environment', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId, true);
        await createLegacyKey(accountId, environmentId, 'deleted-env', newer);

        await copyNewerWebhookSigningKeys(db.knex);

        expect((await signingKey(environmentId))?.secret).toBe('deleted-env');
    });

    it('skips a deleted signing key and an orphaned relation', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId);
        await createLegacyKey(accountId, environmentId, 'deleted-key', newer, new Date());
        const highest = await db.knex('_nango_environments').max('id as max').first();
        const missingId = Number(highest?.['max'] ?? 0) + 1000;
        await createLegacyKey(accountId, missingId, 'orphan', newer);

        await copyNewerWebhookSigningKeys(db.knex);

        expect(await signingKey(environmentId)).toBeUndefined();
        expect(await signingKey(missingId)).toBeUndefined();
    });

    it('deletes the legacy signing keys', async () => {
        const accountId = await createAccount();
        const environmentId = await createEnvironment(accountId);
        await createLegacyKey(accountId, environmentId, 'doomed', newer);

        await deleteWebhookSigningCustomerKeys(db.knex);

        const remaining = await db.knex('customer_keys').where({ account_id: accountId, key_type: 'webhook_signing' });
        expect(remaining).toHaveLength(0);
    });
});

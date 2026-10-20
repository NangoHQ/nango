import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

const require = createRequire(import.meta.url);
const { copyWebhookSigningKeys } = require('./migration-helpers/copyWebhookSigningKeys.cjs');

const createdAt = new Date('2024-01-02T03:04:05.000Z');
const updatedAt = new Date('2024-06-07T08:09:10.000Z');

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

async function createKey({
    accountId,
    environmentId,
    keyType = 'webhook_signing',
    deletedAt = null
}: {
    accountId: number;
    environmentId: number;
    keyType?: 'api' | 'webhook_signing';
    deletedAt?: Date | null;
}): Promise<void> {
    const unique = randomUUID();
    const [key] = await db
        .knex('customer_keys')
        .insert({
            account_id: accountId,
            key_type: keyType,
            display_name: 'Webhook signing',
            scopes: null,
            secret: `secret-${unique}`,
            iv: `iv-${unique}`,
            tag: `tag-${unique}`,
            hashed: `hashed-${unique}`,
            created_at: createdAt,
            updated_at: updatedAt,
            deleted_at: deletedAt
        })
        .returning('id');
    await db.knex('customer_keys_relations').insert({
        customer_key_id: key.id,
        entity_type: 'environment',
        entity_id: environmentId
    });
}

async function copiedRow(environmentId: number) {
    const { rows } = await db.knex.raw<{
        rows: { same_secret: boolean; same_iv: boolean; same_tag: boolean; same_created: boolean; same_updated: boolean }[];
    }>(
        `SELECT webhook_signing_keys.secret = customer_keys.secret AS same_secret,
                webhook_signing_keys.iv = customer_keys.iv AS same_iv,
                webhook_signing_keys.tag = customer_keys.tag AS same_tag,
                webhook_signing_keys.created_at = customer_keys.created_at AS same_created,
                webhook_signing_keys.updated_at = customer_keys.updated_at AS same_updated
         FROM webhook_signing_keys
         JOIN customer_keys_relations relation
           ON relation.entity_type = 'environment'
          AND relation.entity_id = webhook_signing_keys.environment_id
         JOIN customer_keys
           ON customer_keys.id = relation.customer_key_id
          AND customer_keys.key_type = 'webhook_signing'
          AND customer_keys.deleted_at IS NULL
         WHERE webhook_signing_keys.environment_id = ?`,
        [environmentId]
    );
    return rows[0];
}

async function destroyAccount(accountId: number): Promise<void> {
    const environmentIds = await db.knex('_nango_environments').where({ account_id: accountId }).pluck('id');
    if (environmentIds.length > 0) {
        await db.knex('_nango_environments').whereIn('id', environmentIds).delete();
    }
    await db.knex('_nango_accounts').where({ id: accountId }).delete();
}

async function withAccount(run: (accountId: number) => Promise<void>): Promise<void> {
    const accountId = await createAccount();
    try {
        await run(accountId);
    } finally {
        await destroyAccount(accountId);
    }
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

describe('copyWebhookSigningKeys', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await allowWebhookSigningKeyType();
    });

    afterAll(async () => {
        await db.knex('customer_keys').where({ key_type: 'webhook_signing' }).delete();
        await narrowCustomerKeyTypeToApi();
    });

    it('copies a live signing key and keeps its ciphertext and timestamps', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId);
            await createKey({ accountId, environmentId });

            await copyWebhookSigningKeys(db.knex);

            expect(await copiedRow(environmentId)).toEqual({
                same_secret: true,
                same_iv: true,
                same_tag: true,
                same_created: true,
                same_updated: true
            });
        });
    });

    it('does not copy a deleted signing key', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId);
            await createKey({ accountId, environmentId, deletedAt: new Date() });

            await copyWebhookSigningKeys(db.knex);

            expect(await db.knex('webhook_signing_keys').where({ environment_id: environmentId }).first()).toBeUndefined();
        });
    });

    it('does not copy an API key', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId);
            await createKey({ accountId, environmentId, keyType: 'api' });

            await copyWebhookSigningKeys(db.knex);

            expect(await db.knex('webhook_signing_keys').where({ environment_id: environmentId }).first()).toBeUndefined();
        });
    });

    it('copies the signing key of a soft-deleted environment', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId, true);
            await createKey({ accountId, environmentId });

            await copyWebhookSigningKeys(db.knex);

            expect(await copiedRow(environmentId)).toEqual({
                same_secret: true,
                same_iv: true,
                same_tag: true,
                same_created: true,
                same_updated: true
            });
        });
    });

    it('aborts without copying when an environment has two live signing keys', async () => {
        await withAccount(async (accountId) => {
            const duplicated = await createEnvironment(accountId);
            const untouched = await createEnvironment(accountId);
            await createKey({ accountId, environmentId: duplicated });
            await createKey({ accountId, environmentId: duplicated });
            await createKey({ accountId, environmentId: untouched });

            await expect(copyWebhookSigningKeys(db.knex)).rejects.toThrow(`webhook signing keys are not unique per environment: ${duplicated}`);
            expect(await db.knex('webhook_signing_keys').where({ environment_id: untouched }).first()).toBeUndefined();
        });
    });

    it('aborts without copying when a signing key relation points at a missing environment', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId);
            await createKey({ accountId, environmentId });
            const highest = await db.knex('_nango_environments').max('id as max').first();
            const missingId = Number(highest?.['max'] ?? 0) + 1000;
            const unique = randomUUID();
            const [orphan] = await db
                .knex('customer_keys')
                .insert({
                    account_id: accountId,
                    key_type: 'webhook_signing',
                    display_name: 'Webhook signing',
                    scopes: null,
                    secret: `secret-${unique}`,
                    iv: `iv-${unique}`,
                    tag: `tag-${unique}`,
                    hashed: `hashed-${unique}`
                })
                .returning('id');
            await db.knex('customer_keys_relations').insert({
                customer_key_id: orphan.id,
                entity_type: 'environment',
                entity_id: missingId
            });

            await expect(copyWebhookSigningKeys(db.knex)).rejects.toThrow(`webhook signing keys reference missing environments: ${missingId}`);
            expect(await db.knex('webhook_signing_keys').where({ environment_id: environmentId }).first()).toBeUndefined();
        });
    });

    it('removes the copied signing key when the environment is hard-deleted', async () => {
        await withAccount(async (accountId) => {
            const environmentId = await createEnvironment(accountId);
            await createKey({ accountId, environmentId });
            await copyWebhookSigningKeys(db.knex);

            await db.knex('_nango_environments').where({ id: environmentId }).delete();

            expect(await db.knex('webhook_signing_keys').where({ environment_id: environmentId }).first()).toBeUndefined();
        });
    });
});

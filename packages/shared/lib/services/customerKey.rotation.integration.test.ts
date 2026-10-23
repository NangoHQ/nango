import * as uuid from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../seeders/global.seeder.js';
import { getEncryptionManager } from '../utils/encryption.manager.js';
import customerKeyService, { CustomerKeyError } from './customerKey.service.js';

import type { EncryptionManager } from '../utils/encryption.manager.js';

// Stands in for a rotation committed by another process, which leaves this process's cache untouched.
async function rotateInDb(envId: number): Promise<string> {
    const secret = uuid.v4();
    const encrypted = encryptedSecret(secret);
    await db
        .knex('webhook_signing_keys')
        .where({ environment_id: envId })
        .update({ secret: encrypted.secret, iv: encrypted.iv, tag: encrypted.tag, updated_at: db.knex.raw('clock_timestamp()') });
    return secret;
}

function encryptedSecret(secret: string) {
    return getEncryptionManager().encryptAPISecret({ secret, iv: '', tag: '' } as Parameters<EncryptionManager['encryptAPISecret']>[0]);
}

function legacySigningKey(envId: number) {
    const ids = db.knex('customer_keys_relations').select('customer_key_id').where('entity_type', 'environment').where('entity_id', envId);
    return db.knex('customer_keys').where('key_type', 'webhook_signing').whereNull('deleted_at').whereIn('id', ids);
}

async function insertLegacySigningKey(accountId: number, envId: number, plainSecret: string): Promise<void> {
    const encrypted = encryptedSecret(plainSecret);
    const [key] = await db
        .knex('customer_keys')
        .insert({
            account_id: accountId,
            key_type: 'webhook_signing',
            display_name: 'Webhook signing',
            scopes: null,
            secret: encrypted.secret,
            iv: encrypted.iv,
            tag: encrypted.tag,
            hashed: uuid.v4()
        })
        .returning('id');
    await db.knex('customer_keys_relations').insert({
        customer_key_id: key.id,
        entity_type: 'environment',
        entity_id: envId
    });
}

async function plaintext(envId: number): Promise<string> {
    const fresh = await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, envId);
    if (fresh.isErr()) {
        throw fresh.error;
    }
    return fresh.value;
}

describe('rotateWebhookSigningKey cache', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('serves the last committed key when rotations overlap', async () => {
        const { env } = await seedAccountEnvAndUser();

        const [first, second] = await Promise.all([
            customerKeyService.rotateWebhookSigningKey(db.knex, env.id),
            customerKeyService.rotateWebhookSigningKey(db.knex, env.id)
        ]);
        if (first.isErr()) {
            throw first.error;
        }
        if (second.isErr()) {
            throw second.error;
        }

        const committed = await plaintext(env.id);
        expect([first.value, second.value]).toContain(committed);

        const served = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (served.isErr()) {
            throw served.error;
        }
        expect(served.value).toBe(committed);
    });

    it('does not let a read that started before a rotation repopulate the old key', async () => {
        const { env } = await seedAccountEnvAndUser();

        const before = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (before.isErr()) {
            throw before.error;
        }

        const inFlight = customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, env.id);
        if (rotated.isErr()) {
            throw rotated.error;
        }
        await inFlight;

        const served = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (served.isErr()) {
            throw served.error;
        }
        expect(served.value).toBe(rotated.value);
        expect(served.value).not.toBe(before.value);
    });

    it('the uncached read serves a key rotated elsewhere without touching the cache', async () => {
        const { env } = await seedAccountEnvAndUser();

        const before = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (before.isErr()) {
            throw before.error;
        }
        const rotated = await rotateInDb(env.id);

        const cached = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (cached.isErr()) {
            throw cached.error;
        }
        expect(cached.value).toBe(before.value);

        const fresh = await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id);
        if (fresh.isErr()) {
            throw fresh.error;
        }
        expect(fresh.value).toBe(rotated);

        const after = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (after.isErr()) {
            throw after.error;
        }
        expect(after.value).toBe(before.value);
    });
});

describe('webhook signing key rows', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('serves the legacy signing key when it is newer', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const legacySecret = uuid.v4();
        const current = encryptedSecret(uuid.v4());

        await db
            .knex('webhook_signing_keys')
            .where({ environment_id: env.id })
            .update({ secret: current.secret, iv: current.iv, tag: current.tag, updated_at: db.knex.raw("clock_timestamp() - interval '1 minute'") });
        await insertLegacySigningKey(account.id, env.id, legacySecret);

        expect(await plaintext(env.id)).toBe(legacySecret);
    });

    it('serves the new signing key when it is newer', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const currentSecret = uuid.v4();
        const current = encryptedSecret(currentSecret);

        await insertLegacySigningKey(account.id, env.id, uuid.v4());
        await legacySigningKey(env.id).update({ updated_at: db.knex.raw("clock_timestamp() - interval '1 minute'") });
        await db
            .knex('webhook_signing_keys')
            .where({ environment_id: env.id })
            .update({ secret: current.secret, iv: current.iv, tag: current.tag, updated_at: db.knex.raw('clock_timestamp()') });

        expect(await plaintext(env.id)).toBe(currentSecret);
    });

    it('serves the signing key when only the new row exists', async () => {
        const { env } = await seedAccountEnvAndUser();
        const currentSecret = uuid.v4();
        const current = encryptedSecret(currentSecret);

        await db.knex('webhook_signing_keys').where({ environment_id: env.id }).update({ secret: current.secret, iv: current.iv, tag: current.tag });
        await legacySigningKey(env.id).delete();

        expect(await plaintext(env.id)).toBe(currentSecret);
    });

    it('creates an environment signing key without a legacy row', async () => {
        const { env, account } = await seedAccountEnvAndUser();

        expect(await legacySigningKey(env.id).first()).toBeUndefined();

        const created = await customerKeyService.createWebhookSigningKey(db.knex, {
            accountId: account.id,
            environmentId: env.id
        });
        if (created.isErr()) {
            throw created.error;
        }
        expect(await plaintext(env.id)).toBe(created.value);
        expect(await legacySigningKey(env.id).first()).toBeUndefined();
    });

    it('rotates a signing key that exists only in webhook_signing_keys', async () => {
        const { env } = await seedAccountEnvAndUser();
        await legacySigningKey(env.id).delete();

        const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, env.id);
        if (rotated.isErr()) {
            throw rotated.error;
        }
        expect(await plaintext(env.id)).toBe(rotated.value);
    });

    it('rotates a signing key that exists only on customer_keys without changing that row', async () => {
        const { env, account } = await seedAccountEnvAndUser();
        const legacySecret = uuid.v4();
        await db.knex('webhook_signing_keys').where({ environment_id: env.id }).delete();
        await insertLegacySigningKey(account.id, env.id, legacySecret);
        const before = await legacySigningKey(env.id).first();

        const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, env.id);
        if (rotated.isErr()) {
            throw rotated.error;
        }

        const after = await legacySigningKey(env.id).first();
        expect(new Date(after.updated_at).toISOString()).toBe(new Date(before.updated_at).toISOString());
        expect(rotated.value).not.toBe(legacySecret);
        expect(await plaintext(env.id)).toBe(rotated.value);
    });

    it('returns no signing key when neither row exists', async () => {
        const { env } = await seedAccountEnvAndUser();
        await legacySigningKey(env.id).delete();
        await db.knex('webhook_signing_keys').where({ environment_id: env.id }).delete();

        const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, env.id);
        expect(rotated.isErr()).toBe(true);
        if (rotated.isErr()) {
            expect(rotated.error).toBeInstanceOf(CustomerKeyError);
            expect((rotated.error as CustomerKeyError).code).toBe('no_webhook_signing_key');
        }
        expect(await db.knex('webhook_signing_keys').where({ environment_id: env.id }).first()).toBeUndefined();
    });

    it('does not let an earlier rotation overwrite a newer signing key', async () => {
        const { env } = await seedAccountEnvAndUser();
        const newer = uuid.v4();

        let releaseHold: () => void = () => undefined;
        const holdOpen = new Promise<void>((resolve) => {
            releaseHold = resolve;
        });
        let markLocked: () => void = () => undefined;
        const lockHeld = new Promise<void>((resolve) => {
            markLocked = resolve;
        });

        const holder = db.knex.transaction(async (trx) => {
            await trx('webhook_signing_keys').where({ environment_id: env.id }).forUpdate().first();
            markLocked();
            await holdOpen;
            const encrypted = encryptedSecret(newer);
            await trx('webhook_signing_keys')
                .where({ environment_id: env.id })
                .update({ secret: encrypted.secret, iv: encrypted.iv, tag: encrypted.tag, updated_at: trx.raw('clock_timestamp()') });
        });

        await lockHeld;
        const rotating = customerKeyService.rotateWebhookSigningKey(db.knex, env.id);

        const deadline = Date.now() + 8_000;
        let blocked = false;
        while (Date.now() < deadline) {
            const { rows } = await db.knex.raw<{ rows: { pid: number }[] }>(
                `SELECT pid
                 FROM pg_stat_activity
                 WHERE pid <> pg_backend_pid()
                   AND wait_event_type = 'Lock'
                   AND query ILIKE '%webhook_signing_keys%'
                   AND query ILIKE '%on conflict%'`
            );
            if (rows.length > 0) {
                blocked = true;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        releaseHold();
        await holder;
        const rotated = await rotating;
        if (rotated.isErr()) {
            throw rotated.error;
        }
        expect(rotated.value).toBe(newer);
        expect(blocked).toBe(true);
        expect(await plaintext(env.id)).toBe(newer);
    });
});

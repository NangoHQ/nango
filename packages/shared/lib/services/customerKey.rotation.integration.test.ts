import * as uuid from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../seeders/global.seeder.js';
import { getEncryptionManager } from '../utils/encryption.manager.js';
import customerKeyService from './customerKey.service.js';

import type { EncryptionManager } from '../utils/encryption.manager.js';

// Stands in for a rotation committed by another process, which leaves this process's cache untouched.
async function rotateInDb(envId: number): Promise<string> {
    const secret = uuid.v4();
    const encrypted = getEncryptionManager().encryptAPISecret({ secret, iv: '', tag: '' } as Parameters<EncryptionManager['encryptAPISecret']>[0]);
    const ids = db.knex('customer_keys_relations').select('customer_key_id').where('entity_type', 'environment').where('entity_id', envId);
    await db
        .knex('customer_keys')
        .where('key_type', 'webhook_signing')
        .whereIn('id', ids)
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

        expect(first.value).not.toBe(second.value);
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
        const { env } = await seedAccountEnvAndUser();
        const legacySecret = uuid.v4();
        const legacy = encryptedSecret(legacySecret);
        const current = encryptedSecret(uuid.v4());

        await legacySigningKey(env.id).update({
            secret: legacy.secret,
            iv: legacy.iv,
            tag: legacy.tag,
            updated_at: db.knex.raw('clock_timestamp()')
        });
        await db
            .knex('webhook_signing_keys')
            .where({ environment_id: env.id })
            .update({ secret: current.secret, iv: current.iv, tag: current.tag, updated_at: db.knex.raw("clock_timestamp() - interval '1 minute'") });

        expect(await plaintext(env.id)).toBe(legacySecret);
    });

    it('serves the new signing key when it is newer', async () => {
        const { env } = await seedAccountEnvAndUser();
        const currentSecret = uuid.v4();
        const current = encryptedSecret(currentSecret);
        const legacy = encryptedSecret(uuid.v4());

        await legacySigningKey(env.id).update({
            secret: legacy.secret,
            iv: legacy.iv,
            tag: legacy.tag,
            updated_at: db.knex.raw("clock_timestamp() - interval '1 minute'")
        });
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

    it('stores one updated_at on both signing key rows when rotating', async () => {
        const { env } = await seedAccountEnvAndUser();
        const rotated = await customerKeyService.rotateWebhookSigningKey(db.knex, env.id);
        if (rotated.isErr()) {
            throw rotated.error;
        }

        const { rows } = await db.knex.raw<{ rows: { same: boolean }[] }>(
            `SELECT customer_keys.updated_at = webhook_signing_keys.updated_at AS same
             FROM customer_keys
             JOIN customer_keys_relations relation
               ON relation.customer_key_id = customer_keys.id
              AND relation.entity_type = 'environment'
              AND relation.entity_id = ?
             JOIN webhook_signing_keys
               ON webhook_signing_keys.environment_id = relation.entity_id
             WHERE customer_keys.key_type = 'webhook_signing'
               AND customer_keys.deleted_at IS NULL`,
            [env.id]
        );
        expect(rows[0]?.same).toBe(true);
        expect(await plaintext(env.id)).toBe(rotated.value);
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

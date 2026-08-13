import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../seeders/global.seeder.js';
import { getEncryptionManager } from '../utils/encryption.manager.js';
import customerKeyService from './customerKey.service.js';

async function storedKey(envId: number): Promise<string> {
    const row = await db
        .knex('customer_keys')
        .select('customer_keys.secret', 'customer_keys.iv', 'customer_keys.tag')
        .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
        .where('customer_keys.key_type', 'webhook_signing')
        .where('customer_keys_relations.entity_id', envId)
        .first();
    return getEncryptionManager().decryptAPISecret(row).secret;
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
        const stored = await storedKey(env.id);
        expect([first.value, second.value]).toContain(stored);

        const served = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (served.isErr()) {
            throw served.error;
        }
        expect(served.value).toBe(stored);
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
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, getEncryptionManager, seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/environment/webhook-signing-key/rotate';
let api: Awaited<ReturnType<typeof runServer>>;

function signingKeyRow(envId: number) {
    return db
        .knex('customer_keys')
        .select('customer_keys.secret', 'customer_keys.iv', 'customer_keys.tag', 'customer_keys.hashed')
        .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
        .where('customer_keys.key_type', 'webhook_signing')
        .where('customer_keys_relations.entity_id', envId)
        .first();
}

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        // @ts-expect-error query params are required
        const res = await api.fetch(route, { method: 'POST', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should rotate the key and serve the new one', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const before = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (before.isErr()) {
            throw before.error;
        }

        const { res, json } = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });

        isSuccess(json);
        expect(res.status).toBe(200);
        expect(json.data.webhook_signing_key).not.toBe(before.value);

        const after = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (after.isErr()) {
            throw after.error;
        }
        expect(after.value).toBe(json.data.webhook_signing_key);

        // getWebhookSigningKeyForEnv is served from the cache the rotation just filled, so check the row too.
        expect(getEncryptionManager().decryptAPISecret(await signingKeyRow(env.id)).secret).toBe(json.data.webhook_signing_key);
    });

    it('should store the key encrypted and decryptable', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const { json } = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });
        isSuccess(json);

        const row = await signingKeyRow(env.id);

        expect(row.secret).not.toBe(json.data.webhook_signing_key);
        expect(row.iv).not.toBe('');
        expect(row.tag).not.toBe('');
        expect(row.hashed).not.toBe('');
        expect(getEncryptionManager().decryptAPISecret(row).secret).toBe(json.data.webhook_signing_key);
    });

    it('should rotate through the public api with a secret key', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        const before = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (before.isErr()) {
            throw before.error;
        }

        const { res, json } = await api.fetch('/environment/webhook-signing-key/rotate', { method: 'POST', token: apiKey.secret });

        isSuccess(json);
        expect(res.status).toBe(200);
        expect(json.data.webhook_signing_key).not.toBe(before.value);
    });

    it('should rotate only the requested environment', async () => {
        const { env, account, user } = await seeders.seedAccountEnvAndUser();
        const otherEnv = await seeders.createEnvironmentSeed(account.id, 'other');
        const session = await authenticateUser(api, user);

        const otherBefore = getEncryptionManager().decryptAPISecret(await signingKeyRow(otherEnv.id)).secret;

        const { json } = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });
        isSuccess(json);

        expect(getEncryptionManager().decryptAPISecret(await signingKeyRow(env.id)).secret).toBe(json.data.webhook_signing_key);
        expect(getEncryptionManager().decryptAPISecret(await signingKeyRow(otherEnv.id)).secret).toBe(otherBefore);
    });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, getEncryptionManager, seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/environment/webhook-signing-key/rotate';
let api: Awaited<ReturnType<typeof runServer>>;

async function committedSigningKey(envId: number): Promise<string> {
    const fresh = await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, envId);
    if (fresh.isErr()) {
        throw fresh.error;
    }
    return fresh.value;
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

        expect(await committedSigningKey(env.id)).toBe(json.data.webhook_signing_key);
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

        const row = await db.knex('webhook_signing_keys').where({ environment_id: env.id }).first();
        expect(row.secret).not.toBe(json.data.webhook_signing_key);
        expect(row.iv).not.toBe('');
        expect(row.tag).not.toBe('');
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

        const otherBefore = await committedSigningKey(otherEnv.id);

        const { json } = await api.fetch(route, {
            method: 'POST',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });
        isSuccess(json);

        expect(await committedSigningKey(env.id)).toBe(json.data.webhook_signing_key);
        expect(await committedSigningKey(otherEnv.id)).toBe(otherBefore);
    });
});

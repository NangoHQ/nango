import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { envs } from '../../env.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/internal/environments/:environmentId/webhook-signing-key/rotate';
let api: Awaited<ReturnType<typeof runServer>>;
const internalKey = 'test-internal-api-key';
let previousInternalKey: string | undefined;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        previousInternalKey = envs.NANGO_INTERNAL_API_KEY;
        envs.NANGO_INTERNAL_API_KEY = internalKey;
        api = await runServer();
    });

    afterAll(() => {
        envs.NANGO_INTERNAL_API_KEY = previousInternalKey;
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'POST', params: { environmentId: 1 } });

        shouldBeProtected(res);
    });

    it('should reject a wrong internal key', async () => {
        const { res, json } = await api.fetch(route, { method: 'POST', params: { environmentId: 1 }, token: 'nope' });

        isError(json);
        // The code is not registered in NangoError, so it comes back prefixed. Same for every /internal route.
        expect(json.error.code).toContain('invalid_internal_private_key');
        expect(res.status).toBe(500);
    });

    it('should 404 when the environment has no signing key', async () => {
        const { res, json } = await api.fetch(route, { method: 'POST', params: { environmentId: 99999999 }, token: internalKey });

        isError(json);
        expect(json.error.code).toBe('not_found');
        expect(res.status).toBe(404);
    });

    it('should rotate the key and serve the new one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const before = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (before.isErr()) {
            throw before.error;
        }

        const { res, json } = await api.fetch(route, { method: 'POST', params: { environmentId: env.id }, token: internalKey });

        isSuccess(json);
        expect(res.status).toBe(200);
        expect(json.data.webhook_signing_key).not.toBe(before.value);

        const after = await customerKeyService.getWebhookSigningKeyForEnv(db.knex, env.id);
        if (after.isErr()) {
            throw after.error;
        }
        expect(after.value).toBe(json.data.webhook_signing_key);
    });

    it('should keep the stored key decryptable', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const { json } = await api.fetch(route, { method: 'POST', params: { environmentId: env.id }, token: internalKey });
        isSuccess(json);

        const row = await db
            .knex('customer_keys')
            .select('customer_keys.secret', 'customer_keys.iv', 'customer_keys.tag', 'customer_keys.hashed')
            .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
            .where('customer_keys.key_type', 'webhook_signing')
            .where('customer_keys_relations.entity_id', env.id)
            .first();

        expect(row.secret).not.toBe(json.data.webhook_signing_key);
        expect(row.iv).not.toBe('');
        expect(row.tag).not.toBe('');
        expect(row.hashed).not.toBe('');
    });
});

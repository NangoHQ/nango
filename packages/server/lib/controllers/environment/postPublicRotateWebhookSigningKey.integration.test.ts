import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { isSuccess, runServer } from '../../utils/tests.js';

import type { PostPublicRotateWebhookSigningKey } from '@nangohq/types';

const route = '/environment/webhook-signing-key/rotate';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => api.server.close());

    it('imports a UUID v4 signing key and normalizes it to lowercase', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const key = uuid().toUpperCase();
        const { res, json } = await api.fetch(route, { method: 'POST', token: apiKey.secret, body: { webhook_signing_key: key } });
        expect(res.status).toBe(200);
        expect(json).toEqual({ data: { webhook_signing_key: key.toLowerCase() } });
        expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap()).toBe(key.toLowerCase());
    });

    it.each([undefined, {}])('generates a key when none is supplied in body %j', async (body) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const before = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap();
        // @ts-expect-error The request helper requires a body, but this route accepts no body at runtime (it is fully optional).
        const { res, json } = await api.fetch(route, { method: 'POST', token: apiKey.secret, ...(body !== undefined && { body }) });
        expect(res.status).toBe(200);
        isSuccess(json);
        expect(json.data.webhook_signing_key).toBeUUID();
        expect(json.data.webhook_signing_key).not.toBe(before);
    });

    it.each([
        { webhook_signing_key: '' },
        { webhook_signing_key: 'not-a-uuid' },
        { webhook_signing_key: '01932d5e-7b5c-7e27-9d62-1bd0f0a21c8f' },
        { webhook_signing_key: null },
        { webhook_signing_key: 42 },
        { signing_key: uuid() }
    ])('rejects invalid input without rotating: %j', async (body) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const before = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap();
        const { res, json } = await api.fetch(route, { method: 'POST', token: apiKey.secret, body: body as PostPublicRotateWebhookSigningKey['Body'] });
        expect(res.status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'invalid_body' } });
        expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap()).toBe(before);
    });

    it('requires the rotation scope to import a key', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        (await customerKeyService.updateApiKeyScopes(db.knex, apiKey.id, ['environment:integrations:list'], env.id)).unwrap();
        const before = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap();
        const { res } = await api.fetch(route, { method: 'POST', token: apiKey.secret, body: { webhook_signing_key: uuid() } });
        expect(res.status).toBe(403);
        expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap()).toBe(before);
    });
});

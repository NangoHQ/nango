import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { externalWebhookService, seeders } from '@nangohq/shared';
import { Err } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected, shouldRequireSessionEnv } from '../../../../utils/tests.js';

const route = '/api/v1/environments/webhook';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: 'dev' },
            body: { primary_url: 'https://example.com/webhook' }
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'PATCH', session, body: { primary_url: 'https://example.com/webhook' } }
        );

        shouldRequireSessionEnv(res);
    });

    it('should reject denylisted webhook URLs', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            session,
            body: { primary_url: 'http://localhost/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject custom denylisted webhook URLs', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            session,
            body: { primary_url: 'https://denylisted-proxy-test.invalid/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject nango.dev webhook URLs', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            session,
            body: { primary_url: 'https://api.nango.dev/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should return 500 when the webhook update returns an error', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const before = await externalWebhookService.get(env.id);
        vi.spyOn(externalWebhookService, 'upsert').mockResolvedValueOnce(Err(new Error('Webhook update failed')));

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            session,
            body: { primary_url: 'https://example.com/webhook' }
        });

        expect(res.res.status).toBe(500);
        expect(res.json).toEqual({ error: { code: 'server_error', message: 'Failed to update webhook configuration' } });
        await expect(externalWebhookService.get(env.id)).resolves.toEqual(before);
    });

    it('should accept allowed webhook URLs', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const primaryUrl = 'https://example.com/webhook';

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            session,
            body: { primary_url: primaryUrl }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const webhook = await db.knex('_nango_external_webhooks').where({ environment_id: env.id }).first();
        expect(webhook?.primary_url).toBe(primaryUrl);
    });
});

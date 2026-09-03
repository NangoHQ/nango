import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/environments/webhook';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'PATCH', token: apiKey.secret, body: { primary_url: 'https://example.com/webhook' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should reject denylisted webhook URLs', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            body: { primary_url: 'http://localhost/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject custom denylisted webhook URLs', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            body: { primary_url: 'https://denylisted-proxy-test.invalid/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should reject nango.dev webhook URLs', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            body: { primary_url: 'https://api.nango.dev/webhook' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('should accept allowed webhook URLs', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const primaryUrl = 'https://example.com/webhook';

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name },
            token: apiKey.secret,
            body: { primary_url: primaryUrl }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const webhook = await db.knex('_nango_external_webhooks').where({ environment_id: env.id }).first();
        expect(webhook?.primary_url).toBe(primaryUrl);
    });
});

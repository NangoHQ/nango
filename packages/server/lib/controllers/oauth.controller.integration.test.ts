import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { connectionService, seeders } from '@nangohq/shared';

import { isSuccess, runServer } from '../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

describe('POST /oauth2/auth/:providerConfigKey', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    afterAll(() => {
        api.server.close();
    });

    it('returns a resource capped error when creating an OAuth2 client credentials connection at the cap', async () => {
        const { env, apiKey, plan } = await seeders.seedAccountEnvAndUser();
        const config = await seeders.createConfigSeed(env, 'oauth2-client-credentials', '8x8');
        const session = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { end_user: { id: 'capped-oauth2-cc-user', email: 'capped-oauth2-cc@example.com' } }
        });
        isSuccess(session.json);

        vi.spyOn(connectionService, 'getOauthClientCredentials').mockResolvedValue({
            success: true,
            error: null,
            response: {
                type: 'OAUTH2_CC',
                token: 'token',
                client_id: 'client-id',
                client_secret: 'client-secret',
                raw: {}
            }
        });
        await db.knex('plans').where({ id: plan.id }).update({ connections_max: 0 });

        const url = new URL(`/oauth2/auth/${config.unique_key}`, api.url);
        url.searchParams.set('connect_session_token', session.json.data.token);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ client_id: 'client-id', client_secret: 'client-secret' })
        });
        const body = (await res.json()) as { error: { code: string; message: string } };

        expect(res.status).toBe(400);
        expect(body).toStrictEqual<typeof body>({
            error: {
                code: 'resource_capped',
                message: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.'
            }
        });
    });
});

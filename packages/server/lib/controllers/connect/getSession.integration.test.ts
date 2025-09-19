import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { ConnectUISettings } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/session';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET'
        });

        shouldBeProtected(res);
    });

    it('should fail if using secret key', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_connect_session_token_format',
                message: 'Authentication failed. The provided connect session token is not following correct format: nango_connect_session_RANDOM)',
                payload: {}
            }
        });
        expect(res.res.status).toBe(401);
    });

    it('should failed if no session', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: 'nango_connect_session_0123456789012345678901234567890123456789012345678901234567891234'
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'unknown_connect_session_token',
                message: 'Authentication failed. The provided connect session token does not match any account.',
                payload: {}
            }
        });
        expect(res.res.status).toBe(401);
    });

    it('should get a session', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Create session
        const endUserId = 'knownId';
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['github'] }
        });
        isSuccess(resCreate.json);

        // Get session
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                endUser: { id: endUserId, email: 'a@b.com', display_name: null, tags: null, organization: null },
                allowed_integrations: ['github'],
                connectUISettings: connectUISettingsService.defaultConnectUISettings
            }
        });
        expect(res.res.status).toBe(200);
    });

    it('should get a session with custom connect UI settings', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Create custom connect UI settings
        const customConnectUISettings: ConnectUISettings = {
            showWatermark: true,
            defaultTheme: 'system',
            theme: {
                light: {
                    primary: '#ffffff'
                },
                dark: {
                    primary: '#000000'
                }
            }
        };
        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, customConnectUISettings);

        // Create session
        const endUserId = 'knownId';
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['github'] }
        });
        isSuccess(resCreate.json);

        // Get session
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                endUser: { id: endUserId, email: 'a@b.com', display_name: null, tags: null, organization: null },
                allowed_integrations: ['github'],
                connectUISettings: customConnectUISettings
            }
        });
        expect(res.res.status).toBe(200);
    });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/connect-ui-settings';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing env query param
        const res = await api.fetch(route, { token: env.secret_key });

        shouldRequireQueryEnv(res);
    });

    it('should return default settings when no custom settings exist', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        // Ensure no custom settings exist for this environment
        await db.knex('connect_ui_settings').where('environment_id', env.id).del();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: connectUISettingsService.defaultConnectUISettings
        });
    });

    it('should return custom settings when they exist', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const customSettings = {
            showWatermark: false,
            theme: {
                light: {
                    background: '#f0f0f0',
                    foreground: '#333333',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#000000',
                    textMuted: '#666666'
                },
                dark: {
                    background: '#1a1a1a',
                    foreground: '#cccccc',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#ffffff',
                    textMuted: '#999999'
                }
            }
        };

        // Create custom settings using the service
        const upsertResult = await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, customSettings);
        expect(upsertResult.isOk()).toBe(true);

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: customSettings
        });
    });

    it('should return different settings for different environments', async () => {
        const { env: env1 } = await seeders.seedAccountEnvAndUser();
        const { env: env2 } = await seeders.seedAccountEnvAndUser();

        const settings1 = {
            showWatermark: true,
            theme: {
                light: {
                    background: '#ffffff',
                    foreground: '#000000',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#000000',
                    textMuted: '#666666'
                },
                dark: {
                    background: '#000000',
                    foreground: '#ffffff',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#ffffff',
                    textMuted: '#999999'
                }
            }
        };

        const settings2 = {
            showWatermark: false,
            theme: {
                light: {
                    background: '#f0f0f0',
                    foreground: '#333333',
                    primary: '#28a745',
                    primaryForeground: '#ffffff',
                    textPrimary: '#000000',
                    textMuted: '#666666'
                },
                dark: {
                    background: '#1a1a1a',
                    foreground: '#cccccc',
                    primary: '#28a745',
                    primaryForeground: '#ffffff',
                    textPrimary: '#ffffff',
                    textMuted: '#999999'
                }
            }
        };

        // Create different settings for each environment
        await connectUISettingsService.upsertConnectUISettings(db.knex, env1.id, settings1);
        await connectUISettingsService.upsertConnectUISettings(db.knex, env2.id, settings2);

        // Test first environment
        const res1 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env1.secret_key
        });

        expect(res1.res.status).toBe(200);
        isSuccess(res1.json);
        expect(res1.json.data).toStrictEqual(settings1);

        // Test second environment
        const res2 = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env2.secret_key
        });

        expect(res2.res.status).toBe(200);
        isSuccess(res2.json);
        expect(res2.json.data).toStrictEqual(settings2);

        // Clean up
        await db.knex('connect_ui_settings').where('environment_id', env1.id).del();
        await db.knex('connect_ui_settings').where('environment_id', env2.id).del();
    });
});

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

import type { ConnectUISettings } from '@nangohq/types';

const route = '/api/v1/connect-ui-settings';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`PUT ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    const testSettings = {
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

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            body: testSettings
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing env query param
        const res = await api.fetch(route, {
            method: 'PUT',
            token: env.secret_key,
            body: testSettings
        });

        shouldRequireQueryEnv(res);
    });

    it('should create new settings when they do not exist initially', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        // Ensure no custom settings exist for this environment
        await db.knex('connect_ui_settings').where('environment_id', env.id).del();

        const newSettings = {
            ...testSettings
        };

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: newSettings
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: newSettings
        });

        // Verify the settings were actually created in the database
        const dbSettings = await connectUISettingsService.getConnectUISettings(db.knex, env.id);
        assert(dbSettings.isOk());
        expect(dbSettings.value).toStrictEqual(newSettings);
    });

    it('should update existing settings when they already exist', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        // Create initial settings
        const initialSettings = testSettings;

        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, initialSettings);

        // Update the settings
        const updatedSettings = {
            showWatermark: false,
            theme: {
                light: {
                    background: '#e9ecef',
                    foreground: '#495057',
                    primary: '#28a745',
                    primaryForeground: '#ffffff',
                    textPrimary: '#000000',
                    textMuted: '#6c757d'
                },
                dark: {
                    background: '#343a40',
                    foreground: '#e9ecef',
                    primary: '#28a745',
                    primaryForeground: '#ffffff',
                    textPrimary: '#ffffff',
                    textMuted: '#adb5bd'
                }
            }
        };

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: updatedSettings
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: updatedSettings
        });

        // Verify the settings were actually updated in the database
        const dbSettings = await connectUISettingsService.getConnectUISettings(db.knex, env.id);
        assert(dbSettings.isOk());
        expect(dbSettings.value).toStrictEqual(updatedSettings);
    });

    it('should reject invalid body with missing required fields', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const invalidBody = {
            showWatermark: true
            // Missing theme field
        } as ConnectUISettings;

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: invalidBody
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected object, received undefined',
                        path: ['theme']
                    }
                ]
            }
        });
    });

    it('should reject invalid body with missing properties', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const invalidBody = {
            // Missing showWatermark
            theme: {
                light: {
                    background: '#ffffff',
                    foreground: '#000000',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#000000'
                    // Missing textMuted
                },
                dark: {
                    // Missing background
                    foreground: '#ffffff',
                    primary: '#007bff',
                    primaryForeground: '#ffffff',
                    textPrimary: '#ffffff',
                    textMuted: '#999999'
                }
            }
        } as ConnectUISettings;

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: invalidBody
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['theme', 'light', 'textMuted']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['theme', 'dark', 'background']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected boolean, received undefined',
                        path: ['showWatermark']
                    }
                ]
            }
        });
    });
});

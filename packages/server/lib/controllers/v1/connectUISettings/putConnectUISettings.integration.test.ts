import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, seeders, updatePlan } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

import type { ConnectUISettings } from '@nangohq/types';

const route = '/api/v1/connect-ui-settings';
let api: Awaited<ReturnType<typeof runServer>>;

function getCustomSettings(): ConnectUISettings {
    return {
        showWatermark: false,
        defaultTheme: 'system',
        theme: {
            light: {
                primary: '#eeeeee'
            },
            dark: {
                primary: '#111111'
            }
        }
    };
}

describe(`PUT ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            body: getCustomSettings()
        });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        // @ts-expect-error missing env query param
        const res = await api.fetch(route, {
            method: 'PUT',
            token: env.secret_key,
            body: getCustomSettings()
        });

        shouldRequireQueryEnv(res);
    });

    it('should create new settings when they do not exist initially and both plan features are enabled', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Enable both plan features so custom settings can be preserved
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: true });

        // Ensure no custom settings exist for this environment
        await db.knex('connect_ui_settings').where('environment_id', env.id).del();

        const newSettings = {
            ...getCustomSettings()
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

    it('should update existing settings when they already exist and both plan features are enabled', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Enable both plan features so custom settings can be preserved
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: true });

        // Create initial settings
        const initialSettings = getCustomSettings();

        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, initialSettings);

        // Update the settings
        const updatedSettings: ConnectUISettings = {
            showWatermark: false,
            defaultTheme: 'light',
            theme: {
                light: {
                    primary: '#dddddd'
                },
                dark: {
                    primary: '#222222'
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
            showWatermark: true,
            defaultTheme: 'invalid'
            // Missing theme field
        } as unknown as ConnectUISettings;

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
                    },
                    {
                        code: 'invalid_value',
                        message: 'Invalid option: expected one of "light"|"dark"|"system"',
                        path: ['defaultTheme']
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
                    // Missing primary
                },
                dark: {
                    // Missing primary
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
                        path: ['theme', 'light', 'primary']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['theme', 'dark', 'primary']
                    },
                    {
                        code: 'invalid_value',
                        message: 'Invalid option: expected one of "light"|"dark"|"system"',
                        path: ['defaultTheme']
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

    it('should override theme to defaults when plan does not have can_customize_connect_ui_theme flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Disable the theme customization feature for this plan, but enable watermark customization
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: false, can_disable_connect_ui_watermark: true });

        const testSettings = {
            ...getCustomSettings(),
            showWatermark: false
        };

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: testSettings
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // Theme should be overridden to defaults in response, but showWatermark should remain custom
        expect(res.json.data.theme).toStrictEqual(connectUISettingsService.defaultConnectUISettings.theme);
        expect(res.json.data.showWatermark).toBe(false); // Should preserve custom value

        // Verify the settings were stored in database with theme overridden
        const dbSettings = await connectUISettingsService.getConnectUISettings(db.knex, env.id);
        assert(dbSettings.isOk());
        expect(dbSettings.value?.theme).toStrictEqual(connectUISettingsService.defaultConnectUISettings.theme);
        expect(dbSettings.value?.showWatermark).toBe(false);
    });

    it('should override showWatermark to defaults when plan does not have can_disable_connect_ui_watermark flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Disable the watermark customization feature for this plan, but enable theme customization
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: false });

        const testSettings = {
            ...getCustomSettings(),
            showWatermark: false
        };

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: testSettings
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // showWatermark should be overridden to default in response, but theme should remain custom
        expect(res.json.data.showWatermark).toBe(connectUISettingsService.defaultConnectUISettings.showWatermark);
        expect(res.json.data.theme).toStrictEqual(testSettings.theme); // Should preserve custom theme

        // Verify the settings were stored in database with showWatermark overridden
        const dbSettings = await connectUISettingsService.getConnectUISettings(db.knex, env.id);
        assert(dbSettings.isOk());
        expect(dbSettings.value?.showWatermark).toBe(connectUISettingsService.defaultConnectUISettings.showWatermark);
        expect(dbSettings.value?.theme).toStrictEqual(testSettings.theme);
    });

    it('should override both features to defaults when plan has neither flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Disable both features for this plan
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: false, can_disable_connect_ui_watermark: false });

        const testSettings = getCustomSettings();

        const res = await api.fetch(route, {
            method: 'PUT',
            query: { env: 'dev' },
            token: env.secret_key,
            body: testSettings
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // Both should be overridden to defaults in response
        expect(res.json.data).toStrictEqual(connectUISettingsService.defaultConnectUISettings);

        // Verify the settings were stored in database with both features overridden
        const dbSettings = await connectUISettingsService.getConnectUISettings(db.knex, env.id);
        assert(dbSettings.isOk());
        expect(dbSettings.value).toStrictEqual(connectUISettingsService.defaultConnectUISettings);
    });
});

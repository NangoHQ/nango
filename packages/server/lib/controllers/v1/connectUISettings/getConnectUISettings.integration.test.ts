import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, seeders, updatePlan } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

import type { ConnectUISettings } from '@nangohq/types';

const route = '/api/v1/connect-ui-settings';
let api: Awaited<ReturnType<typeof runServer>>;

function getCustomSettings(): ConnectUISettings {
    return {
        showWatermark: false,
        theme: {
            light: {
                background: '#eeeeee',
                foreground: '#eeeeee',
                primary: '#eeeeee',
                primaryForeground: '#eeeeee',
                textPrimary: '#eeeeee',
                textMuted: '#eeeeee'
            },
            dark: {
                background: '#111111',
                foreground: '#111111',
                primary: '#111111',
                primaryForeground: '#111111',
                textPrimary: '#111111',
                textMuted: '#111111'
            }
        }
    };
}

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

    it('should return custom settings when they exist and both plan features are enabled', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: true });

        const testSettings = getCustomSettings();

        // Create custom settings using the service
        const upsertResult = await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, testSettings);
        expect(upsertResult.isOk()).toBe(true);

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: testSettings
        });
    });

    it('should return default theme when plan does not have can_customize_connect_ui_theme flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        const testSettings = {
            ...getCustomSettings(),
            showWatermark: false
        };

        // Store custom settings in database
        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, testSettings);

        // Disable the theme customization feature for this plan, but enable watermark customization
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: false, can_disable_connect_ui_watermark: true });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // Theme should be overridden to defaults, but showWatermark should remain custom
        expect(res.json.data.theme).toStrictEqual(connectUISettingsService.defaultConnectUISettings.theme);
        expect(res.json.data.showWatermark).toBe(false); // Should preserve custom value
    });

    it('should return default showWatermark when plan does not have can_disable_connect_ui_watermark flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Create custom settings with non-default watermark setting
        const testSettings = {
            ...getCustomSettings(),
            showWatermark: false
        };

        // Store custom settings in database
        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, testSettings);

        // Disable the watermark customization feature for this plan, but enable theme customization
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: false });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // showWatermark should be overridden to default, but theme should remain custom
        expect(res.json.data.showWatermark).toBe(connectUISettingsService.defaultConnectUISettings.showWatermark);
        expect(res.json.data.theme).toStrictEqual(testSettings.theme); // Should preserve custom theme
    });

    it('should return default values for both features when plan has neither flag', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Create custom settings with non-default values
        const testSettings = getCustomSettings();

        // Store custom settings in database
        await connectUISettingsService.upsertConnectUISettings(db.knex, env.id, testSettings);

        // Disable both features for this plan
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: false, can_disable_connect_ui_watermark: false });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // Both should be overridden to defaults
        expect(res.json.data).toStrictEqual(connectUISettingsService.defaultConnectUISettings);
    });

    it('should return default settings when no custom settings exist and plan has no feature flags', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        // Ensure no custom settings exist for this environment
        await db.knex('connect_ui_settings').where('environment_id', env.id).del();

        // Disable both features for this plan
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: false, can_disable_connect_ui_watermark: false });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            token: env.secret_key
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        // Should return default settings
        expect(res.json.data).toStrictEqual(connectUISettingsService.defaultConnectUISettings);
    });
});

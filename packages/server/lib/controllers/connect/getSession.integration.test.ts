import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { connectUISettingsService, linkConnection, seeders, updatePlan } from '@nangohq/shared';

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
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret
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
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Create session
        const endUserId = 'knownId';
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
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
                connectUISettings: connectUISettingsService.getDefaultConnectUISettings()
            }
        });
        expect(res.res.status).toBe(200);
    });

    it('should get a session without endUser when created with tags', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Create session
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { tags: { projectId: '123' }, allowed_integrations: ['github'] }
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
                endUser: null,
                allowed_integrations: ['github'],
                connectUISettings: connectUISettingsService.getDefaultConnectUISettings()
            }
        });
        expect(res.res.status).toBe(200);
    });

    it('should get a session without endUser when created with empty tags object', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        // Create session
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: { tags: {}, allowed_integrations: ['github'] }
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
                endUser: null,
                allowed_integrations: ['github'],
                connectUISettings: connectUISettingsService.getDefaultConnectUISettings()
            }
        });
        expect(res.res.status).toBe(200);
    });

    it('should get a session with custom connect UI settings when both customization flags are enabled', async () => {
        const { env, apiKey, plan } = await seeders.seedAccountEnvAndUser();
        // Enable both features so custom settings can be preserved
        await updatePlan(db.knex, { id: plan.id, can_customize_connect_ui_theme: true, can_disable_connect_ui_watermark: true });
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
            token: apiKey.secret,
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

    it('should get a session with default connect UI settings when both customization flags are disabled', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
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
            token: apiKey.secret,
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
                connectUISettings: connectUISettingsService.getDefaultConnectUISettings()
            }
        });
        expect(res.res.status).toBe(200);
    });

    it('should echo only allowlisted AWS_SIGV4 credentials (role_arn, region) from integrations_config_defaults', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const endUserId = 'knownId';
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                end_user: { id: endUserId, email: 'a@b.com' },
                integrations_config_defaults: {
                    'aws-sigv4': {
                        connection_config: { region: 'us-east-1' },
                        credentials: {
                            role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole',
                            region: 'us-east-1',
                            // Anything outside the allowlist must be stripped from the response
                            secret_access_key: 'fake-secret',
                            session_token: 'fake-token',
                            apiKey: 'fake'
                        }
                    }
                }
            }
        });
        isSuccess(resCreate.json);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        const credentials = res.json.data.integrations_config_defaults?.['aws-sigv4']?.credentials;
        expect(credentials).toEqual({
            role_arn: 'arn:aws:iam::123456789012:role/NangoAccessRole',
            region: 'us-east-1'
        });
        // Defensive: assert none of the unsafe keys made it through
        expect(credentials).not.toHaveProperty('secret_access_key');
        expect(credentials).not.toHaveProperty('session_token');
        expect(credentials).not.toHaveProperty('apiKey');
        expect(res.res.status).toBe(200);
    });

    it('should NOT echo integrations_config_defaults credentials for non-AWS_SIGV4 auth modes (avoid leaking pre-seeded secrets)', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const endUserId = 'knownId';
        const resCreate = await api.fetch('/connect/sessions', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                end_user: { id: endUserId, email: 'a@b.com' },
                integrations_config_defaults: {
                    github: {
                        connection_config: { workspace: 'acme' },
                        credentials: { oauth_client_secret_override: 'super-secret' }
                    }
                }
            }
        });
        isSuccess(resCreate.json);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        // connection_config still echoes; credentials are stripped to avoid leaking pre-seeded secrets
        expect(res.json.data.integrations_config_defaults?.['github']?.connection_config).toEqual({ workspace: 'acme' });
        expect(res.json.data.integrations_config_defaults?.['github']).not.toHaveProperty('credentials');
    });

    it('should hydrate ONLY allowlisted connection_config fields on AWS_SIGV4 reconnect (external_id; never role_arn/region/service)', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const storedExternalId = '1bdff5dc-1b49-4f1c-9880-4402f8cad9cb';
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'aws-sigv4',
            connectionConfig: {
                external_id: storedExternalId,
                role_arn: 'arn:aws:iam::123456789012:role/Old',
                region: 'us-east-1',
                service: 's3'
            }
        });

        const resCreate = await api.fetch('/connect/sessions/reconnect', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                connection_id: connection.connection_id,
                integration_id: 'aws-sigv4'
            }
        });
        isSuccess(resCreate.json);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        expect(res.json.data.isReconnecting).toBe(true);
        const connectionConfig = res.json.data.integrations_config_defaults?.['aws-sigv4']?.connection_config;
        // Only the allowlisted external_id is hydrated; other stored fields stay server-side
        expect(connectionConfig).toEqual({ external_id: storedExternalId });
        expect(connectionConfig).not.toHaveProperty('role_arn');
        expect(connectionConfig).not.toHaveProperty('region');
        expect(connectionConfig).not.toHaveProperty('service');
    });

    it('should let stored external_id override client-passed value on AWS_SIGV4 reconnect', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'aws-sigv4', 'aws-sigv4');

        const storedExternalId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
        const clientExternalId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'aws-sigv4',
            connectionConfig: { external_id: storedExternalId }
        });

        const resCreate = await api.fetch('/connect/sessions/reconnect', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                connection_id: connection.connection_id,
                integration_id: 'aws-sigv4',
                integrations_config_defaults: {
                    'aws-sigv4': {
                        connection_config: { external_id: clientExternalId }
                    }
                }
            }
        });
        isSuccess(resCreate.json);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        // Stored wins so the Connect UI matches what postAwsSigV4 will actually use
        expect(res.json.data.integrations_config_defaults?.['aws-sigv4']?.connection_config?.['external_id']).toBe(storedExternalId);
    });

    it('should NOT hydrate stored connection_config on reconnect for non-AWS_SIGV4 providers (avoid leaking stored values like subdomain/account_id)', async () => {
        const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
        const endUser = await seeders.createEndUser({ environment: env, account });
        await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            connectionConfig: { subdomain: 'acme-internal', account_id: 'acct_secret_123', oauth_state: 'private-state' }
        });
        await linkConnection(db.knex, { endUserId: endUser.id, connection });

        const resCreate = await api.fetch('/connect/sessions/reconnect', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                connection_id: connection.connection_id,
                integration_id: 'github'
            }
        });
        isSuccess(resCreate.json);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: resCreate.json.data.token
        });

        isSuccess(res.json);
        expect(res.json.data.isReconnecting).toBe(true);
        // For non-AWS_SIGV4 reconnects, the session has no integrations_config_defaults beyond
        // whatever the vendor explicitly passed at session creation. Stored values stay server-side.
        expect(res.json.data.integrations_config_defaults?.['github']?.connection_config).toBeUndefined();
    });
});

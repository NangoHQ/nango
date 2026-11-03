import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { createCredentials } from './githubApp.js';
import * as jwtClient from './jwt.js';

import type { DBConnectionDecrypted, IntegrationConfig, ProviderGithubApp } from '@nangohq/types';

vi.mock('./jwt.js', () => ({
    createCredentialsFromURL: vi.fn(),
    fetchJwtToken: vi.fn()
}));

const integrationKey = 'integration-private-key';
const storedKey = 'stored-private-key';
const overrideKey = 'override-private-key';

const provider = {
    auth_mode: 'APP',
    display_name: 'GitHub (App)',
    docs: '',
    token_url: 'https://api.github.com/app/installations/${connectionConfig.installation_id}/access_tokens'
} as ProviderGithubApp;

function integration(custom?: Record<string, string> | null): IntegrationConfig {
    return {
        oauth_client_id: 'integration-app',
        oauth_client_secret: Buffer.from(integrationKey).toString('base64'),
        app_link: 'https://github.com/apps/integration',
        custom: custom ?? null
    } as IntegrationConfig;
}

function connectionWithOverride(): DBConnectionDecrypted {
    return {
        credentials: {
            type: 'APP',
            access_token: 'old',
            raw: {},
            config_override: {
                app_id: 'stored-app',
                private_key: Buffer.from(storedKey).toString('base64'),
                app_link: 'https://github.com/apps/stored',
                webhook_secret: 'stored-webhook-secret'
            }
        },
        connection_config: { installation_id: '1', app_id: 'stored-app' }
    } as unknown as DBConnectionDecrypted;
}

describe('githubApp.createCredentials', () => {
    beforeEach(() => {
        vi.mocked(jwtClient.createCredentialsFromURL).mockReset();
        vi.mocked(jwtClient.createCredentialsFromURL).mockResolvedValue(Ok({ tokenResponse: { type: 'JWT', token: 'installation-token' }, jwtToken: 'jwt' }));
    });

    it('prefers an explicit override and returns it for later refreshes', async () => {
        const result = await createCredentials({
            provider,
            integration: integration(),
            connection: connectionWithOverride(),
            connectionConfig: { installation_id: '1' },
            override: {
                app_id: 'override-app',
                private_key: Buffer.from(overrideKey).toString('base64'),
                app_link: 'https://github.com/apps/override',
                webhook_secret: 'override-webhook-secret'
            }
        });

        expect(jwtClient.createCredentialsFromURL).toHaveBeenCalledWith(
            expect.objectContaining({
                privateKey: overrideKey,
                payload: expect.objectContaining({ iss: 'override-app' })
            })
        );
        expect(result.isOk() && result.value.config_override).toEqual({
            app_id: 'override-app',
            private_key: Buffer.from(overrideKey).toString('base64'),
            app_link: 'https://github.com/apps/override',
            webhook_secret: 'override-webhook-secret'
        });
    });

    it('prefers a stored config_override over the integration and copies it forward', async () => {
        const result = await createCredentials({
            provider,
            integration: integration(),
            connection: connectionWithOverride(),
            connectionConfig: { installation_id: '1' }
        });

        expect(jwtClient.createCredentialsFromURL).toHaveBeenCalledWith(
            expect.objectContaining({
                privateKey: storedKey,
                payload: expect.objectContaining({ iss: 'stored-app' })
            })
        );
        expect(result.isOk() && result.value.config_override?.app_id).toBe('stored-app');
    });

    it('uses integration credentials when no override is present', async () => {
        const result = await createCredentials({
            provider,
            integration: integration(),
            connectionConfig: { installation_id: '1' }
        });

        expect(jwtClient.createCredentialsFromURL).toHaveBeenCalledWith(
            expect.objectContaining({
                privateKey: integrationKey,
                payload: expect.objectContaining({ iss: 'integration-app' })
            })
        );
        expect(result.isOk() && result.value.config_override).toBeUndefined();
    });

    it('keeps using custom app credentials when no connection override is present', async () => {
        await createCredentials({
            provider,
            integration: integration({
                app_id: 'custom-app',
                private_key: Buffer.from('custom-private-key').toString('base64')
            }),
            connectionConfig: { installation_id: '1' }
        });

        expect(jwtClient.createCredentialsFromURL).toHaveBeenCalledWith(
            expect.objectContaining({
                privateKey: 'custom-private-key',
                payload: expect.objectContaining({ iss: 'custom-app' })
            })
        );
    });
});

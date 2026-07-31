import { afterEach, describe, expect, it, vi } from 'vitest';

import * as shared from '@nangohq/shared';

import integrationService from './integration.service.js';

import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('integrationService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lists integrations with their providers for an environment', async () => {
        const githubIntegration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
        const slackIntegration = integrationFixture({ uniqueKey: 'slack', provider: 'slack' });
        const githubProvider = providerFixture('GitHub');
        const slackProvider = providerFixture('Slack');

        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([githubIntegration, slackIntegration]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({
            github: githubProvider,
            slack: slackProvider
        });

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([
                { integration: githubIntegration, provider: githubProvider },
                { integration: slackIntegration, provider: slackProvider }
            ]);
        }
    });

    it('filters integrations to those allowed by a Connect Session', async () => {
        const githubIntegration = integrationFixture({ uniqueKey: 'github', provider: 'github' });
        const slackIntegration = integrationFixture({ uniqueKey: 'slack', provider: 'slack' });
        const githubProvider = providerFixture('GitHub');
        const slackProvider = providerFixture('Slack');

        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([githubIntegration, slackIntegration]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({
            github: githubProvider,
            slack: slackProvider
        });

        const result = await integrationService.list({ environmentId: 42, allowedIntegrations: ['slack'] });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([{ integration: slackIntegration, provider: slackProvider }]);
        }
    });

    it('returns an error when providers cannot be loaded', async () => {
        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([]);
        vi.spyOn(shared, 'getProviders').mockReturnValue(undefined);

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'failed to load providers'
            });
        }
    });

    it('returns an error when an integration references a missing provider', async () => {
        vi.spyOn(shared.configService, 'listProviderConfigs').mockResolvedValue([integrationFixture({ uniqueKey: 'missing', provider: 'missing' })]);
        vi.spyOn(shared, 'getProviders').mockReturnValue({});

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'Failed to list integrations',
                cause: new Error("Provider 'missing' does not exist")
            });
        }
    });

    it('wraps unexpected listing failures as service errors', async () => {
        const cause = new Error('database failed');
        vi.spyOn(shared.configService, 'listProviderConfigs').mockRejectedValue(cause);

        const result = await integrationService.list({ environmentId: 42 });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({
                code: 'list_failed',
                message: 'Failed to list integrations',
                cause
            });
        }
    });
});

function integrationFixture({ uniqueKey, provider }: { uniqueKey: string; provider: string }): Config {
    return {
        unique_key: uniqueKey,
        provider,
        oauth_client_id: '',
        oauth_client_secret: '',
        environment_id: 42,
        missing_fields: [],
        display_name: null,
        forward_webhooks: true,
        shared_credentials_id: null,
        created_at: createdAt,
        updated_at: updatedAt
    };
}

function providerFixture(displayName: string): Provider {
    return {
        display_name: displayName,
        auth_mode: 'OAUTH2',
        docs: ''
    };
}

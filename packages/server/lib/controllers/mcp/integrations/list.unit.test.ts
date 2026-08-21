import { afterEach, describe, expect, it, vi } from 'vitest';

import { basePublicUrl, Ok } from '@nangohq/utils';

import integrationService from '../../../services/integration.service.js';
import { listIntegrationsTool } from './list.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config } from '@nangohq/shared';
import type { Provider } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:list']
} as ManagementMcpContext;

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('listIntegrationsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the integration list', async () => {
        vi.spyOn(integrationService, 'list').mockResolvedValue(
            Ok([
                {
                    integration: integrationFixture(),
                    provider: providerFixture()
                }
            ])
        );

        const result = await listIntegrationsTool.handler({}, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                data: [
                    {
                        unique_key: 'github',
                        provider: 'github',
                        display_name: 'GitHub',
                        logo: `${basePublicUrl}/images/template-logos/github.svg`,
                        forward_webhooks: true,
                        created_at: createdAt.toISOString(),
                        updated_at: updatedAt.toISOString()
                    }
                ]
            });
        }
    });
});

function integrationFixture(): Config {
    return {
        unique_key: 'github',
        provider: 'github',
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

function providerFixture(): Provider {
    return {
        display_name: 'GitHub',
        auth_mode: 'OAUTH2',
        docs: ''
    };
}

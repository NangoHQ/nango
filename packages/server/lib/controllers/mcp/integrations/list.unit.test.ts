import { afterEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import integrationService from '../../../services/integration.service.js';
import { PublicMcpError } from '../utils.js';
import { integrationsListTool } from './list.js';

import type { ControlPlaneMcpContext } from '../controlPlaneTool.js';
import type { GetPublicListIntegrations } from '@nangohq/types';

const context = {
    account: {},
    environment: { id: 42 },
    grantedScopes: ['environment:integrations:list']
} as ControlPlaneMcpContext;

const integrationListResponse: GetPublicListIntegrations['Success'] = {
    data: [
        {
            unique_key: 'github',
            provider: 'github',
            display_name: 'GitHub',
            logo: 'https://example.com/github.svg',
            forward_webhooks: true,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        }
    ]
};

describe('integrationsListTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the integration list', async () => {
        vi.spyOn(integrationService, 'list').mockResolvedValue(Ok(integrationListResponse));

        const result = await integrationsListTool.handler({}, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(integrationListResponse);
        }
    });

    it('returns a public error for invalid arguments', async () => {
        vi.spyOn(integrationService, 'list').mockResolvedValue(Ok(integrationListResponse));

        const result = await integrationsListTool.handler({ unexpected: true }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid integrations_list arguments');
        }
    });
});

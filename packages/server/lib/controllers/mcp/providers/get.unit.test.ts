import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import providerService, { ProviderServiceError } from '../../../services/provider.service.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { getProvidersTool } from './get.js';

import type { ManagementMcpContext } from '../managementTool.js';

describe('getProvidersTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps MCP arguments to the provider service and formats the result', async () => {
        const getSpy = vi.spyOn(providerService, 'get').mockReturnValue(
            Ok({
                name: 'github',
                provider: {
                    display_name: 'GitHub',
                    auth_mode: 'OAUTH2',
                    docs: 'https://nango.dev/docs/api-integrations/github'
                },
                templates: []
            })
        );

        const result = await getProvidersTool.handler({ provider: 'github', include_templates: true }, context);

        expect(getSpy).toHaveBeenCalledWith({ providerName: 'github', includeTemplates: true });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                name: 'github',
                display_name: 'GitHub',
                auth_mode: 'OAUTH2',
                templates: []
            });
        }
    });

    it('defaults include_templates to false', async () => {
        const getSpy = vi.spyOn(providerService, 'get').mockReturnValue(
            Ok({
                name: 'github',
                provider: {
                    display_name: 'GitHub',
                    auth_mode: 'OAUTH2',
                    docs: 'https://nango.dev/docs/api-integrations/github'
                }
            })
        );

        await getProvidersTool.handler({ provider: 'github' }, context);

        expect(getSpy).toHaveBeenCalledWith({ providerName: 'github', includeTemplates: false });
    });

    it.each([
        { name: 'missing provider', args: {} },
        { name: 'invalid provider', args: { provider: 'invalid/provider' } },
        { name: 'non-boolean include_templates', args: { provider: 'github', include_templates: 'true' } },
        { name: 'unknown argument', args: { provider: 'github', unexpected: true } }
    ])('rejects $name before calling the provider service', async ({ args }) => {
        const getSpy = vi.spyOn(providerService, 'get');

        const result = await getProvidersTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid providers_get arguments:');
        }
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('maps unknown providers to public MCP errors', async () => {
        vi.spyOn(providerService, 'get').mockReturnValue(
            Err(
                new ProviderServiceError({
                    code: 'not_found',
                    message: 'Unknown provider missing'
                })
            )
        );

        const result = await getProvidersTool.handler({ provider: 'missing' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Unknown provider missing');
        }
    });

    it('does not expose provider catalog failures', async () => {
        vi.spyOn(providerService, 'get').mockReturnValue(
            Err(
                new ProviderServiceError({
                    code: 'get_failed',
                    message: 'Failed to get provider'
                })
            )
        );

        const result = await getProvidersTool.handler({ provider: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const context = {
    account: { id: 1 },
    environment: { id: 42 },
    plan: null,
    grantedScopes: ['environment:mcp']
} as ManagementMcpContext;

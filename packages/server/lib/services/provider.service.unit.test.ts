import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogStore } from '@nangohq/shared';

import flowService from './flow.service.js';
import providerService, { ProviderServiceError } from './provider.service.js';

import type { StandardNangoConfig } from '@nangohq/types';

describe('ProviderService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('gets a provider without loading templates by default', () => {
        const templatesSpy = vi.spyOn(flowService, 'getProviderTemplates');

        const result = providerService.get({ providerName: 'github' });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                name: 'github',
                provider: { auth_mode: 'OAUTH2' }
            });
            expect(result.value).not.toHaveProperty('templates');
        }
        expect(templatesSpy).not.toHaveBeenCalled();
    });

    it('gets raw provider templates when requested', () => {
        const providerTemplates = providerTemplatesFixture()[0];
        if (!providerTemplates) {
            throw new Error('Expected provider template fixture');
        }
        const templatesSpy = vi.spyOn(flowService, 'getProviderTemplates').mockReturnValue(providerTemplates);

        const result = providerService.get({ providerName: 'github', includeTemplates: true });

        expect(result.isOk()).toBe(true);
        expect(templatesSpy).toHaveBeenCalledWith('github');
        if (result.isOk()) {
            expect(result.value.templates).toStrictEqual([...providerTemplates.actions, ...providerTemplates.syncs]);
        }
    });

    it('returns an empty template list when the flow catalog has no matching provider', () => {
        vi.spyOn(flowService, 'getProviderTemplates').mockReturnValue(null);

        const result = providerService.listTemplates({ providerName: 'missing' });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([]);
        }
    });

    it('counts templates per provider from the catalog index, without reading any provider definitions', () => {
        vi.spyOn(catalogStore, 'listProviders').mockReturnValue(['github', 'github-app']);
        vi.spyOn(catalogStore, 'getCounts').mockReturnValue({ actions: 3, syncs: 2, functions: 2, tools: 1 });
        const templatesSpy = vi.spyOn(flowService, 'getProviderTemplates');

        const result = providerService.countTemplatesByProvider();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect([...result.value.entries()]).toStrictEqual([
                ['github', { tools: 4, syncs: 2 }],
                ['github-app', { tools: 4, syncs: 2 }]
            ]);
        }
        expect(templatesSpy).not.toHaveBeenCalled();
    });

    it('returns a typed not-found error for an unknown provider', () => {
        const result = providerService.get({ providerName: 'definitely-not-a-real-provider' });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ProviderServiceError);
            expect(result.error).toMatchObject({
                code: 'not_found',
                message: 'Unknown provider definitely-not-a-real-provider'
            });
        }
    });

    it('returns a typed internal error when template loading fails', () => {
        vi.spyOn(flowService, 'getProviderTemplates').mockImplementation(() => {
            throw new Error('catalog failed');
        });

        const result = providerService.get({ providerName: 'github', includeTemplates: true });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(ProviderServiceError);
            expect(result.error.code).toBe('list_templates_failed');
        }
    });
});

function providerTemplatesFixture(): StandardNangoConfig[] {
    return [
        {
            providerConfigKey: 'github',
            actions: [
                {
                    name: 'create-issue',
                    type: 'action',
                    returns: ['Issue'],
                    endpoints: [],
                    json_schema: null,
                    sdk_version: null,
                    features: []
                }
            ],
            syncs: [
                {
                    name: 'issues',
                    type: 'sync',
                    returns: ['Issue'],
                    endpoints: [],
                    json_schema: null,
                    sdk_version: null,
                    features: []
                }
            ],
            'on-events': []
        }
    ];
}

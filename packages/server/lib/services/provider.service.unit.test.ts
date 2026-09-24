import { afterEach, describe, expect, it, vi } from 'vitest';

import flowService from './flow.service.js';
import providerService, { ProviderServiceError } from './provider.service.js';

import type { StandardNangoConfig } from '@nangohq/types';

describe('ProviderService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('gets a provider without loading templates by default', () => {
        const templatesSpy = vi.spyOn(flowService, 'getAllAvailableFlowsAsStandardConfig');

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
        const templates = providerTemplatesFixture();
        vi.spyOn(flowService, 'getAllAvailableFlowsAsStandardConfig').mockReturnValue(templates);

        const result = providerService.get({ providerName: 'github', includeTemplates: true });

        expect(result.isOk()).toBe(true);
        const providerTemplates = templates[0];
        if (!providerTemplates) {
            throw new Error('Expected provider template fixture');
        }
        if (result.isOk()) {
            expect(result.value.templates).toStrictEqual([...providerTemplates.actions, ...providerTemplates.syncs]);
        }
    });

    it('returns an empty template list when the flow catalog has no matching provider', () => {
        vi.spyOn(flowService, 'getAllAvailableFlowsAsStandardConfig').mockReturnValue([]);

        const result = providerService.listTemplates({ providerName: 'missing' });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual([]);
        }
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
        vi.spyOn(flowService, 'getAllAvailableFlowsAsStandardConfig').mockImplementation(() => {
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

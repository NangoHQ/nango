import { describe, expect, it } from 'vitest';

import { catalogStore } from '@nangohq/shared';

import flowService from './flow.service.js';

function providerWithSyncsAndActions() {
    for (const provider of catalogStore.listProviders()) {
        const templates = flowService.getProviderTemplates(provider);
        if (templates && templates.syncs.length > 0 && templates.actions.length > 0) {
            return templates;
        }
    }
    throw new Error('expected a provider with both syncs and actions in the catalog');
}

describe('Flow service tests', () => {
    it('should get a provider templates as standard config', () => {
        const templates = providerWithSyncsAndActions();

        expect(templates.providerConfigKey).toBeDefined();
        expect(Array.isArray(templates['on-events'])).toBe(true);
        for (const flow of [...templates.syncs, ...templates.actions]) {
            expect(flow.source).toBe('catalog');
            expect(flow.sdk_version).toMatch(/-zero$/);
        }
    });

    it('should return null for a provider without templates', () => {
        expect(flowService.getProviderTemplates('this-provider-does-not-exist')).toBeNull();
    });

    it('should return equal standard config for repeated calls', () => {
        const templates = providerWithSyncsAndActions();

        expect(flowService.getProviderTemplates(templates.providerConfigKey)).toStrictEqual(templates);
    });

    it('should get flow by integration and name', () => {
        const templates = providerWithSyncsAndActions();
        const provider = templates.providerConfigKey;
        const [sync] = templates.syncs;
        const [action] = templates.actions;
        if (!sync || !action) {
            throw new Error('expected a sync and an action');
        }

        expect(flowService.getFlowByIntegrationAndName({ provider, type: 'sync', scriptName: sync.name })).toStrictEqual(sync);
        expect(flowService.getFlowByIntegrationAndName({ provider, type: 'action', scriptName: action.name })).toStrictEqual(action);
        expect(flowService.getFlowByIntegrationAndName({ provider, type: 'sync', scriptName: 'does-not-exist' })).toBeNull();
        expect(flowService.getFlowByIntegrationAndName({ provider: 'this-provider-does-not-exist', type: 'sync', scriptName: sync.name })).toBeNull();
    });

    it('should resolve the symlink target name for symlinked providers and return null otherwise', () => {
        const symlinked = catalogStore.listProviders().find((provider) => flowService.getSymLinkTargetName(provider));
        const target = symlinked ? flowService.getSymLinkTargetName(symlinked) : null;
        if (!symlinked || !target) {
            throw new Error('expected at least one symlinked provider in the catalog');
        }

        // The target folder is canonical, so it must not itself be a symlink.
        expect(flowService.getSymLinkTargetName(target)).toBeNull();
        expect(flowService.getSymLinkTargetName('this-provider-does-not-exist')).toBeNull();
        // A symlinked provider gets its target's templates under its own key.
        expect(flowService.getProviderTemplates(symlinked)?.providerConfigKey).toBe(symlinked);
    });
});

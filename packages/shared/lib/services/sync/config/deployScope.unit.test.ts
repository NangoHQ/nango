import { describe, expect, it } from 'vitest';

import { onEventScopeProviderKeys, resolveLegacyDeployScope } from './deployScope.js';

describe('resolveLegacyDeployScope', () => {
    it('uses the explicit reconciliation scope, even without flows', () => {
        expect(resolveLegacyDeployScope({ deployMode: 'all', reconciliationScope: { kind: 'environment' }, flows: [] })).toStrictEqual({
            kind: 'environment'
        });
        expect(
            resolveLegacyDeployScope({ deployMode: 'integration', reconciliationScope: { kind: 'integration', integrationId: 'github' }, flows: [] })
        ).toStrictEqual({ kind: 'integration', integrationId: 'github' });
    });

    it('returns single for single deploys', () => {
        expect(resolveLegacyDeployScope({ deployMode: 'single', flows: [{ providerConfigKey: 'github' }] })).toStrictEqual({ kind: 'single' });
    });

    it('uses a function scope for a scoped single-script deployment', () => {
        const scope = { kind: 'function', integrationId: 'github', name: 'contacts' } as const;
        expect(resolveLegacyDeployScope({ deployMode: 'single', reconciliationScope: scope, flows: [{ providerConfigKey: 'github' }] })).toEqual(scope);
    });

    it('returns none for an empty package without an explicit scope', () => {
        expect(resolveLegacyDeployScope({ deployMode: 'all', flows: [] })).toStrictEqual({ kind: 'none' });
        expect(resolveLegacyDeployScope({ deployMode: 'integration', flows: [] })).toStrictEqual({ kind: 'none' });
    });

    it('infers the scope from the flows without an explicit scope', () => {
        expect(resolveLegacyDeployScope({ deployMode: 'all', flows: [{ providerConfigKey: 'github' }] })).toStrictEqual({ kind: 'environment' });
        expect(resolveLegacyDeployScope({ deployMode: 'integration', flows: [{ providerConfigKey: 'github' }] })).toStrictEqual({
            kind: 'integration',
            integrationId: 'github'
        });
    });
});

describe('onEventScopeProviderKeys', () => {
    const payload = [{ providerConfigKey: 'slack' }];

    it('covers every provider of the environment', () => {
        expect(onEventScopeProviderKeys({ kind: 'environment' }, payload)).toBe('all');
    });

    it('preserves on-event scripts for function-scoped deployments', () => {
        expect(onEventScopeProviderKeys({ kind: 'function', integrationId: 'github', name: 'contacts' }, payload)).toStrictEqual([]);
    });

    it('covers the integration and the deployed providers', () => {
        expect(onEventScopeProviderKeys({ kind: 'integration', integrationId: 'github' }, payload)).toStrictEqual(['github', 'slack']);
        expect(onEventScopeProviderKeys({ kind: 'integration', integrationId: 'github' }, [])).toStrictEqual(['github']);
    });

    it('only covers the deployed providers for single and none', () => {
        expect(onEventScopeProviderKeys({ kind: 'single' }, payload)).toStrictEqual(['slack']);
        expect(onEventScopeProviderKeys({ kind: 'none' }, payload)).toStrictEqual(['slack']);
        expect(onEventScopeProviderKeys({ kind: 'none' }, [])).toStrictEqual([]);
    });
});

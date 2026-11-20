import { describe, expect, it } from 'vitest';

import { getInstantSetup, needsSetupFields } from './instantSetup.js';

import type { AuthModeType, Provider } from '@nangohq/types';

function provider(auth_mode: AuthModeType, extra: Record<string, unknown> = {}): Provider {
    return { display_name: 'X', auth_mode, docs: '', ...extra } as Provider;
}

describe('getInstantSetup', () => {
    it('is managed when Nango has preconfigured credentials, even for OAuth 2', () => {
        expect(getInstantSetup(provider('OAUTH2'), true)).toBe('managed');
    });

    it.each(['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM'] as const)('is not instant for %s without preconfigured credentials', (authMode) => {
        expect(getInstantSetup(provider(authMode), false)).toBeNull();
    });

    it.each(['API_KEY', 'BASIC', 'OAUTH2_CC', 'JWT', 'NONE'] as const)('needs no developer app for %s', (authMode) => {
        expect(getInstantSetup(provider(authMode), false)).toBe('no-dev-app');
    });

    it.each(['TBA', 'INSTALL_PLUGIN'] as const)('is not instant for %s, whose setup form has required fields', (authMode) => {
        expect(getInstantSetup(provider(authMode), false)).toBeNull();
        expect(needsSetupFields(provider(authMode))).toBe(true);
    });

    it('is not instant when the provider has integration settings, even when Nango manages its app', () => {
        const withConfig = provider('API_KEY', { integration_config: { region: { type: 'string', title: 'Region', description: '', order: 0 } } });

        expect(getInstantSetup(withConfig, false)).toBeNull();
        expect(getInstantSetup({ ...withConfig, auth_mode: 'OAUTH2' } as Provider, true)).toBeNull();
        expect(needsSetupFields(withConfig)).toBe(true);
    });

    it('is not instant for MCP OAuth with a static client', () => {
        expect(getInstantSetup(provider('MCP_OAUTH2', { client_registration: 'static' }), false)).toBeNull();
        expect(getInstantSetup(provider('MCP_OAUTH2', { client_registration: 'dynamic' }), false)).toBe('no-dev-app');
    });
});

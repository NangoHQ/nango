import { describe, expect, it } from 'vitest';

import { resolveConnectionConfig } from './auth.js';

import type { ConnectSession } from '@nangohq/types';

function connectSessionWith(connectionConfig: Record<string, unknown> | undefined, integrationKey = 'github'): ConnectSession {
    return {
        id: 1,
        endUserId: null,
        accountId: 1,
        environmentId: 1,
        connectionId: null,
        operationId: null,
        allowedIntegrations: null,
        integrationsConfigDefaults: connectionConfig ? { [integrationKey]: { connectionConfig } } : null,
        overrides: null,
        endUser: null,
        tags: {},
        createdAt: new Date(),
        updatedAt: null
    };
}

describe('resolveConnectionConfig', () => {
    it('returns the request params when there is no connect session', () => {
        expect(resolveConnectionConfig({ params: { subdomain: 'acme' }, connectSession: undefined, providerConfigKey: 'github' })).toEqual({
            subdomain: 'acme'
        });
    });

    it('returns an empty object when there are no params and no session', () => {
        expect(resolveConnectionConfig({ params: undefined, connectSession: undefined, providerConfigKey: 'github' })).toEqual({});
    });

    it('merges session defaults on top of the request params', () => {
        const connectSession = connectSessionWith({ webhook_url: 'https://example.com/hook' });
        expect(resolveConnectionConfig({ params: { subdomain: 'acme' }, connectSession, providerConfigKey: 'github' })).toEqual({
            subdomain: 'acme',
            webhook_url: 'https://example.com/hook'
        });
    });

    // This pins the deliberate precedence decision: session defaults (backend-set) win over request
    // params (end-user-supplied), mirroring the OAuth flow. Flipping the merge order breaks this.
    it('lets session defaults win over a conflicting request param', () => {
        const connectSession = connectSessionWith({ subdomain: 'from-session' });
        expect(resolveConnectionConfig({ params: { subdomain: 'from-params' }, connectSession, providerConfigKey: 'github' })).toEqual({
            subdomain: 'from-session'
        });
    });

    it('applies session defaults even when no params are passed', () => {
        const connectSession = connectSessionWith({ webhook_url: 'https://example.com/hook' });
        expect(resolveConnectionConfig({ params: undefined, connectSession, providerConfigKey: 'github' })).toEqual({
            webhook_url: 'https://example.com/hook'
        });
    });

    it('ignores defaults configured for a different integration', () => {
        const connectSession = connectSessionWith({ webhook_url: 'https://example.com/hook' }, 'github');
        expect(resolveConnectionConfig({ params: { subdomain: 'acme' }, connectSession, providerConfigKey: 'slack' })).toEqual({
            subdomain: 'acme'
        });
    });

    it('drops non-string param values while keeping session defaults', () => {
        const connectSession = connectSessionWith({ webhook_url: 'https://example.com/hook' });
        expect(resolveConnectionConfig({ params: { subdomain: 'acme', count: 5 }, connectSession, providerConfigKey: 'github' })).toEqual({
            subdomain: 'acme',
            webhook_url: 'https://example.com/hook'
        });
    });
});

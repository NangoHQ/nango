import { describe, expect, it } from 'vitest';

import { resolveConnectionConfig, resolveConnectionOverrides } from './auth.js';

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

function connectSessionWithOverrides(overrides: Record<string, unknown> | undefined, integrationKey = 'github'): ConnectSession {
    return {
        id: 1,
        endUserId: null,
        accountId: 1,
        environmentId: 1,
        connectionId: null,
        operationId: null,
        allowedIntegrations: null,
        integrationsConfigDefaults: null,
        overrides: overrides ? { [integrationKey]: overrides } : null,
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
        const connectSession = connectSessionWith({ region: 'eu' });
        expect(resolveConnectionConfig({ params: { subdomain: 'acme' }, connectSession, providerConfigKey: 'github' })).toEqual({
            subdomain: 'acme',
            region: 'eu'
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
        const connectSession = connectSessionWith({ region: 'eu' });
        expect(resolveConnectionConfig({ params: undefined, connectSession, providerConfigKey: 'github' })).toEqual({
            region: 'eu'
        });
    });

    it('ignores defaults configured for a different integration', () => {
        const connectSession = connectSessionWith({ region: 'eu' }, 'github');
        expect(resolveConnectionConfig({ params: { subdomain: 'acme' }, connectSession, providerConfigKey: 'slack' })).toEqual({
            subdomain: 'acme'
        });
    });

    it('drops non-string param values while keeping session defaults', () => {
        const connectSession = connectSessionWith({ region: 'eu' });
        expect(resolveConnectionConfig({ params: { subdomain: 'acme', count: 5 }, connectSession, providerConfigKey: 'github' })).toEqual({
            subdomain: 'acme',
            region: 'eu'
        });
    });

    // webhook_url is a reserved key that must never live in connection_config (it is an override, not a provider
    // input). getConnectionConfig strips it from client params as defense-in-depth.
    it('drops a client-supplied webhook_url param', () => {
        expect(
            resolveConnectionConfig({
                params: { subdomain: 'acme', webhook_url: 'https://attacker.example.com/hook' },
                connectSession: undefined,
                providerConfigKey: 'github'
            })
        ).toEqual({ subdomain: 'acme' });
    });
});

describe('resolveConnectionOverrides', () => {
    it('returns null when there is no connect session', () => {
        expect(resolveConnectionOverrides({ connectSession: undefined, providerConfigKey: 'github' })).toBeNull();
    });

    it('returns null when the session has no override for the integration', () => {
        const connectSession = connectSessionWithOverrides({ webhook_url: 'https://backend.example.com/hook' }, 'github');
        expect(resolveConnectionOverrides({ connectSession, providerConfigKey: 'slack' })).toBeNull();
    });

    it('returns the webhook_url override set on the session for the integration', () => {
        const connectSession = connectSessionWithOverrides({ webhook_url: 'https://backend.example.com/hook' }, 'github');
        expect(resolveConnectionOverrides({ connectSession, providerConfigKey: 'github' })).toEqual({ webhook_url: 'https://backend.example.com/hook' });
    });

    it('treats a blank webhook_url as no override', () => {
        const connectSession = connectSessionWithOverrides({ webhook_url: '   ' }, 'github');
        expect(resolveConnectionOverrides({ connectSession, providerConfigKey: 'github' })).toBeNull();
    });
});

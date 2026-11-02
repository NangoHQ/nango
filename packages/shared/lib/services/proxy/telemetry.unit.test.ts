import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { interpolateProxyTemplate, proxyMonitoringAttributes, proxyTrackingLogger, redactProxyTelemetryUrl, trackBaseUrlOverride } from './telemetry.js';
import { getDefaultProxy } from './utils.test.js';

import type { ApiKeyPrincipal } from '@nangohq/types';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('@nangohq/utils', async (importOriginal) => ({
    ...((await importOriginal()) as Record<string, unknown>),
    getLogger: () => ({ info: capture, warning: vi.fn(), error: vi.fn(), debug: vi.fn(), close: vi.fn() })
}));

const apiKey: ApiKeyPrincipal = { type: 'api_key', source: 'customer_key', accountId: 1, environmentIds: [2], keyId: 3, scopes: ['environment:proxy'] };
const connection = getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'stored-token' }, connection_config: { nested: { secret: 'stored-secret' } } });
const integrationConfig = { oauth_client_id: 'client-id', oauth_client_secret: 'client-secret' };

function configuration(key: ApiKeyPrincipal = apiKey) {
    return getDefaultProxy({
        monitoringContext: { callsite: 'proxy', accountId: 1, environmentId: 2, apiKey: key },
        providerName: 'test',
        providerConfigKey: 'test-integration',
        endpoint: '/stored-token/stored-token?secret=stored-secret',
        baseUrlOverride: 'https://user:password@api.example.com/stored-token?secret=stored-secret'
    });
}

function properties(config = configuration()) {
    const attributes = proxyMonitoringAttributes(config, connection, integrationConfig);
    assert(attributes);
    return attributes;
}

beforeEach(() => {
    capture.mockClear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('proxy tracking logs', () => {
    it('logs interpolation to the proxy-tracking index and deduplicates events without exposing values', () => {
        const config = configuration();
        const tracking = { properties: properties(config), interpolations: new Set<string>() };
        for (const location of ['caller_endpoint', 'caller_endpoint', 'provider_query'] as const) {
            interpolateProxyTemplate('${credentials.apiKey}', { credentials: connection.credentials }, config, connection, location, tracking);
        }
        expect(capture).toHaveBeenCalledTimes(2);
        expect(capture).toHaveBeenNthCalledWith(
            1,
            'proxy:interpolation',
            expect.objectContaining({
                logType: 'proxy-tracking',
                account_id: 1,
                environment_id: 2,
                api_key_id: 3,
                callsite: 'proxy',
                provider: 'test',
                http_method: 'GET',
                path: '/REDACTED/REDACTED',
                base_url_override: 'https://api.example.com/REDACTED',
                override_host: 'api.example.com',
                location: 'caller_endpoint',
                credential_type: 'connection_credentials',
                fields: 'credentials.apiKey',
                secret: false,
                credentials: true,
                integration_credentials: false,
                caller_supplied: true,
                would_block: true
            })
        );
        expect(capture).toHaveBeenNthCalledWith(2, 'proxy:interpolation', expect.objectContaining({ caller_supplied: false, would_block: false }));
        expect(JSON.stringify(capture.mock.calls)).not.toMatch(/stored-token|stored-secret|client-secret|user:password/);
        expect(Object.values(properties()).every((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value))).toBe(true);
    });

    it('redacts repeated, encoded and nested values, queries and URL passwords', () => {
        const nestedConnection = getTestConnection({ connection_config: { nested: { secret: 'a/b + c' } } });
        expect(redactProxyTelemetryUrl('/a%2Fb%20%2B%20c/client-secret/client-secret?anything=private#fragment', nestedConnection, integrationConfig)).toBe(
            '/REDACTED/REDACTED/REDACTED'
        );
        expect(redactProxyTelemetryUrl(undefined, connection)).toBeNull();
    });

    it.each([
        { scopes: ['environment:proxy'], missingConnection: true, missingIntegration: true },
        { scopes: ['environment:proxy', 'environment:connections:read_credentials'], missingConnection: false, missingIntegration: true },
        { scopes: ['environment:proxy', 'environment:integrations:*'], missingConnection: true, missingIntegration: false },
        {
            scopes: ['environment:connections:read_credentials', 'environment:integrations:read_credentials'],
            missingConnection: false,
            missingIntegration: false
        },
        { scopes: ['environment:connections:*', 'environment:integrations:*'], missingConnection: false, missingIntegration: false },
        { scopes: ['environment:*'], missingConnection: false, missingIntegration: false }
    ])('records scope flags for $scopes', ({ scopes, missingConnection, missingIntegration }) => {
        const config = configuration({ ...apiKey, scopes });
        trackBaseUrlOverride(config, properties(config));
        expect(capture).toHaveBeenCalledOnce();
        expect(capture).toHaveBeenCalledWith(
            'proxy:base_url_override',
            expect.objectContaining({
                logType: 'proxy-tracking',
                caller_supplied: true,
                has_template: false,
                scope_check_performed: true,
                missing_connection_credentials: missingConnection,
                missing_integration_credentials: missingIntegration,
                would_block: missingConnection || missingIntegration,
                path: '/REDACTED/REDACTED',
                base_url_override: 'https://api.example.com/REDACTED'
            })
        );
        expect(JSON.stringify(capture.mock.calls)).not.toMatch(/stored-token|stored-secret|client-secret|user:password/);
    });

    it('tracks SDK overrides without treating absent API key scopes as a permission gap', () => {
        const config = configuration();
        config.monitoringContext = { accountId: 1, environmentId: 2, callsite: 'sdk' };
        trackBaseUrlOverride(config, properties(config));
        expect(capture).toHaveBeenCalledWith(
            'proxy:base_url_override',
            expect.objectContaining({
                callsite: 'sdk',
                caller_supplied: true,
                api_key_id: null,
                scope_check_performed: false,
                missing_connection_credentials: null,
                missing_integration_credentials: null,
                would_block: null
            })
        );
    });

    it('does not prepare tracking data for internal requests', () => {
        const config = configuration();
        delete config.monitoringContext;
        expect(proxyMonitoringAttributes(config, connection, integrationConfig)).toBeUndefined();
    });

    it('ignores requests without an explicit override', () => {
        const config = configuration();
        delete config.baseUrlOverride;
        trackBaseUrlOverride(config, properties(config));
        expect(capture).not.toHaveBeenCalled();
    });

    it('allows requests to proceed when tracking throws', () => {
        vi.spyOn(proxyTrackingLogger, 'log').mockImplementation(() => {
            throw new Error('logger unavailable');
        });
        const config = configuration();
        expect(() => trackBaseUrlOverride(config, properties(config))).not.toThrow();
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { createProxyInterpolationObserver, observeProxyBaseUrlOverrideScopes, redactProxyTelemetryUrl } from './telemetry.js';

import type { ProxyMonitoringContext } from './telemetry.js';
import type { ApiKeyPrincipal } from '@nangohq/types';
import type * as Utils from '@nangohq/utils';

const { info, increment } = vi.hoisted(() => ({ info: vi.fn(), increment: vi.fn() }));
vi.mock('@nangohq/utils', async (importOriginal) => {
    const original = await importOriginal<typeof Utils>();
    return { ...original, getLogger: () => ({ info }), metrics: { ...original.metrics, increment } };
});

function context(): ProxyMonitoringContext {
    return {
        callsite: 'proxy',
        accountId: 1,
        environmentId: 2,
        apiKeyId: 3,
        provider: 'test',
        integrationId: 'test-integration',
        endpoint: '/stored-token/stored-token?secret=stored-secret',
        baseUrlOverride: 'https://user:password@api.example.com/stored-token?secret=stored-secret',
        connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'stored-token' }, connection_config: { nested: { secret: 'stored-secret' } } }),
        integrationConfig: { oauth_client_id: 'client-id', oauth_client_secret: 'client-secret' }
    };
}

describe('proxy security telemetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records customer/key IDs and locations with safe URL metadata and bounded metric tags', () => {
        const observe = createProxyInterpolationObserver(context);
        const event = { location: 'caller_endpoint' as const, credentialType: 'connection_credentials' as const, fields: ['credentials.apiKey'] };
        observe(event);
        observe(event);
        observe({ ...event, location: 'provider_header' });
        expect(info).toHaveBeenCalledTimes(2);
        expect(info).toHaveBeenNthCalledWith(
            1,
            'Proxy secret interpolation observed',
            expect.objectContaining({
                event: 'proxy_secret_interpolation',
                accountId: 1,
                environmentId: 2,
                apiKeyId: 3,
                path: '/REDACTED/REDACTED',
                baseUrlOverride: 'https://api.example.com/REDACTED',
                callerSupplied: true,
                wouldBlock: true
            })
        );
        expect(info).toHaveBeenNthCalledWith(2, 'Proxy secret interpolation observed', expect.objectContaining({ callerSupplied: false, wouldBlock: false }));
        expect(increment).toHaveBeenCalledWith('nango.proxy.secret_interpolation', 1, {
            callsite: 'proxy',
            provider: 'test',
            location: 'caller_endpoint',
            credentialType: 'connection_credentials',
            callerSupplied: 'true'
        });
        expect(JSON.stringify(info.mock.calls)).not.toMatch(/stored-token|stored-secret|client-secret|user:password/);
    });

    it('redacts repeated, encoded and nested secrets as well as query values and URL passwords', () => {
        const ctx = context();
        ctx.connection.connection_config['nested'] = { secret: 'a/b + c' };
        expect(redactProxyTelemetryUrl('/a%2Fb%20%2B%20c/client-secret/client-secret?anything=private#fragment', ctx)).toBe('/REDACTED/REDACTED/REDACTED');
        expect(redactProxyTelemetryUrl(undefined, ctx)).toBeNull();
    });

    const apiKey: ApiKeyPrincipal = { type: 'api_key', source: 'customer_key', accountId: 1, environmentIds: [2], keyId: 3, scopes: ['environment:proxy'] };

    it.each([
        { scopes: ['environment:proxy'], missing: ['environment:connections:read_credentials', 'environment:integrations:read_credentials'] },
        { scopes: ['environment:proxy', 'environment:connections:read_credentials'], missing: ['environment:integrations:read_credentials'] },
        { scopes: ['environment:proxy', 'environment:integrations:*'], missing: ['environment:connections:read_credentials'] }
    ])('records the missing credential read scopes for $scopes without enforcing them', ({ scopes, missing }) => {
        expect(() => observeProxyBaseUrlOverrideScopes(context(), { ...apiKey, scopes })).not.toThrow();
        expect(info).toHaveBeenCalledOnce();
        expect(info).toHaveBeenCalledWith(
            'Proxy base URL override missing credential read scopes',
            expect.objectContaining({
                event: 'proxy_base_url_override_missing_scopes',
                accountId: 1,
                apiKeyId: 3,
                missingScopes: missing,
                path: '/REDACTED/REDACTED',
                baseUrlOverride: 'https://api.example.com/REDACTED',
                wouldBlock: true
            })
        );
        expect(increment).toHaveBeenCalledWith('nango.proxy.base_url_override.missing_scopes', 1, {
            provider: 'test',
            apiKeySource: 'customer_key',
            missingConnectionCredentials: String(missing.includes('environment:connections:read_credentials')),
            missingIntegrationCredentials: String(missing.includes('environment:integrations:read_credentials'))
        });
        expect(JSON.stringify(info.mock.calls)).not.toMatch(/stored-token|stored-secret|client-secret|user:password/);
    });

    it.each([
        { scopes: ['environment:connections:read_credentials', 'environment:integrations:read_credentials'] },
        { scopes: ['environment:connections:*', 'environment:integrations:*'] },
        { scopes: ['environment:*'] }
    ])('does not report overrides authorized by $scopes', ({ scopes }) => {
        observeProxyBaseUrlOverrideScopes(context(), { ...apiKey, scopes });
        expect(info).not.toHaveBeenCalled();
        expect(increment).not.toHaveBeenCalled();
    });

    it('ignores requests without an override or API key identity', () => {
        observeProxyBaseUrlOverrideScopes({ ...context(), baseUrlOverride: undefined }, apiKey);
        observeProxyBaseUrlOverrideScopes(context(), undefined);
        expect(info).not.toHaveBeenCalled();
    });

    it('allows requests to proceed when the telemetry transport fails', () => {
        increment.mockImplementationOnce(() => {
            throw new Error('Datadog unavailable');
        });
        expect(() => observeProxyBaseUrlOverrideScopes(context(), apiKey)).not.toThrow();
    });
});

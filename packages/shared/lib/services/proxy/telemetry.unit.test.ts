import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { createProxyInterpolationObserver, redactProxyTelemetryUrl } from './telemetry.js';

import type { ProxyMonitoringContext } from './telemetry.js';
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
});

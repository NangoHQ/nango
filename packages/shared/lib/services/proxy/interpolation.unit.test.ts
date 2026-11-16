import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { interpolateProxyTemplate, proxyMonitoringAttributes, proxyTrackingLogger } from './telemetry.js';
import { buildProxyBody, buildProxyURL, getAxiosConfiguration, getProxyConfiguration } from './utils.js';
import { getDefaultProxy } from './utils.test.js';

import type { ProxyTracking } from './telemetry.js';

describe('proxy interpolation monitoring', () => {
    const connection = getTestConnection({
        credentials: { type: 'API_KEY', apiKey: 'stored-token' },
        connection_config: { environment: 'sandbox', secretField: 'stored-secret' }
    });

    const observed = vi.fn();
    let tracking: ProxyTracking;

    beforeEach(() => {
        observed.mockClear();
        vi.spyOn(proxyTrackingLogger, 'log').mockImplementation((_event, properties) => {
            observed(properties);
        });
        const properties = proxyMonitoringAttributes(configuration(), connection);
        assert(properties);
        tracking = { properties, interpolations: new Set() };
    });

    afterEach(() => vi.restoreAllMocks());

    function configuration() {
        return getDefaultProxy({
            endpoint: '/${credentials.apiKey}/${connectionConfig.environment}/${connectionConfig.secretField}',
            monitoringContext: { accountId: 1, environmentId: 2, callsite: 'proxy' },
            provider: {
                connection_config: {
                    environment: { type: 'string', title: 'Environment', description: '', order: 0, automated: false },
                    secretField: { type: 'string', title: 'Secret', description: '', order: 1, automated: false, secret: true }
                },
                proxy: { base_url: 'https://api.example.com/bot${apiKey}' }
            }
        });
    }

    it('tracks caller endpoint substitutions without tracking provider base URLs', () => {
        const config = configuration();
        expect(buildProxyURL({ config, connection, tracking })).toBe('https://api.example.com/botstored-token/stored-token/sandbox/stored-secret');
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_credentials',
                secret: false,
                credentials: true,
                integration_credentials: false,
                fields: 'credentials.apiKey'
            })
        );
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_config',
                secret: true,
                credentials: false,
                integration_credentials: false,
                fields: 'connection_config.secretField'
            })
        );
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_config',
                secret: false,
                credentials: false,
                integration_credentials: false,
                fields: 'connection_config.environment'
            })
        );
        expect(observed).toHaveBeenCalledTimes(3);
    });

    it('observes caller base URL overrides', () => {
        const config = configuration();
        config.baseUrlOverride = 'https://api.example.com/${apiKey}';
        expect(buildProxyURL({ config, connection, tracking })).toBe('https://api.example.com/stored-token/stored-token/sandbox/stored-secret');
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({ location: 'caller_base_url_override', fields: 'apiKey', credentials: true, caller_supplied: true })
        );
        expect(observed).toHaveBeenCalledTimes(4);
    });

    it('interpolates provider base URLs and headers without tracking them', () => {
        const config = configuration();
        config.endpoint = '/users';
        config.headers = { 'x-caller-template': '${credentials.apiKey}' };
        config.provider.proxy = {
            base_url: 'https://api.example.com/bot${apiKey}',
            headers: { 'x-api-key': '${apiKey}', 'x-config-secret': '${connectionConfig.secretField}' }
        };
        const axiosConfig = getAxiosConfiguration({ proxyConfig: config, connection, tracking });
        expect(axiosConfig.url).toBe('https://api.example.com/botstored-token/users');
        expect(axiosConfig.headers).toMatchObject({
            'x-api-key': 'stored-token',
            'x-config-secret': 'stored-secret',
            'x-caller-template': '${credentials.apiKey}'
        });
        expect(observed).not.toHaveBeenCalled();
    });

    it('observes provider query and nested body templates', () => {
        const config = configuration();
        config.endpoint = '/users';
        config.provider.proxy = {
            base_url: 'https://api.example.com',
            query: { token: '${credentials.apiKey}' },
            body: { auth: { token: '${apiKey}' } }
        };
        const url = buildProxyURL({ config, connection, tracking });
        expect(new URL(url).searchParams.get('token')).toBe('stored-token');
        expect(buildProxyBody({ config, connection, tracking })).toEqual({ auth: { token: 'stored-token' } });
        for (const location of ['provider_query', 'provider_body']) {
            expect(observed).toHaveBeenCalledWith(
                expect.objectContaining({ location, credential_type: 'connection_credentials', caller_supplied: false, would_block: false })
            );
        }
        expect(observed).toHaveBeenCalledTimes(2);
    });

    it('only observes resolved fields in the selected fallback branch, including transformations', () => {
        const config = configuration();
        const replacers = { credentials: connection.credentials, connectionConfig: connection.connection_config };
        expect(
            interpolateProxyTemplate('${connectionConfig.environment}||${credentials.apiKey}', replacers, config, connection, 'caller_endpoint', tracking)
        ).toBe('sandbox');
        expect(interpolateProxyTemplate('${credentials.missing}', replacers, config, connection, 'caller_endpoint', tracking)).toBe('${credentials.missing}');
        expect(observed).toHaveBeenCalledOnce();
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_config',
                secret: false,
                credentials: false,
                integration_credentials: false,
                fields: 'connectionConfig.environment'
            })
        );
        observed.mockClear();
        expect(interpolateProxyTemplate('${base64(${credentials.apiKey})}', replacers, config, connection, 'caller_endpoint', tracking)).toBe(
            Buffer.from('stored-token').toString('base64')
        );
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_credentials',
                secret: false,
                credentials: true,
                integration_credentials: false,
                fields: 'credentials.apiKey'
            })
        );
    });

    it('observes public connection-config fields and metadata', () => {
        const config = configuration();
        const replacers = {
            connectionConfig: connection.connection_config,
            metadata: { tenant: 'tenant-id' }
        };
        expect(interpolateProxyTemplate('${connectionConfig.environment}/${metadata.tenant}', replacers, config, connection, 'caller_endpoint', tracking)).toBe(
            'sandbox/tenant-id'
        );
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'connection_config',
                secret: false,
                credentials: false,
                integration_credentials: false,
                fields: 'connectionConfig.environment'
            })
        );
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 'caller_endpoint',
                credential_type: 'other',
                secret: false,
                credentials: false,
                integration_credentials: false,
                fields: 'metadata.tenant'
            })
        );
        expect(observed).toHaveBeenCalledTimes(2);
    });

    it('does not infer secret annotations from credential declarations', () => {
        const config = configuration();
        config.provider.credentials = { apiKey: { type: 'string', title: 'API key', description: '', order: 0, automated: false, secret: true } };
        buildProxyURL({ config, connection, tracking });
        expect(observed).toHaveBeenCalledWith(
            expect.objectContaining({ credential_type: 'connection_credentials', secret: false, credentials: true, integration_credentials: false })
        );
    });

    it('preserves successful interpolation if monitoring fails', () => {
        const config = configuration();
        vi.mocked(proxyTrackingLogger.log).mockImplementation(() => {
            throw new Error('monitor unavailable');
        });
        expect(buildProxyURL({ config, connection, tracking })).toContain('/stored-token/sandbox/stored-secret');
    });

    it('only accepts monitoring provenance from internal configuration', () => {
        const spoofed = { ...configuration(), monitoringContext: { accountId: 1, environmentId: 2, callsite: 'proxy' as const } };
        const actual = getProxyConfiguration({ externalConfig: spoofed, internalConfig: { providerName: 'github' } }).unwrap();
        expect(actual.monitoringContext).toBeUndefined();
    });
});

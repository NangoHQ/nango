import { describe, expect, it, vi } from 'vitest';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { interpolateProxyTemplate } from './interpolation.js';
import { buildProxyBody, buildProxyHeaders, buildProxyURL, getProxyConfiguration } from './utils.js';
import { getDefaultProxy } from './utils.test.js';

describe('proxy interpolation monitoring', () => {
    const connection = getTestConnection({
        credentials: { type: 'API_KEY', apiKey: 'stored-token' },
        connection_config: { environment: 'sandbox', secretField: 'stored-secret' }
    });

    function configuration() {
        return getDefaultProxy({
            endpoint: '/${credentials.apiKey}/${connectionConfig.environment}/${connectionConfig.secretField}',
            onSecretInterpolation: vi.fn(),
            provider: {
                connection_config: {
                    environment: { type: 'string', title: 'Environment', description: '', order: 0, automated: false },
                    secretField: { type: 'string', title: 'Secret', description: '', order: 1, automated: false, secret: true }
                },
                proxy: { base_url: 'https://api.example.com/bot${apiKey}' }
            }
        });
    }

    it('separates provider URL substitutions from caller endpoint substitutions without blocking either', () => {
        const config = configuration();
        expect(buildProxyURL({ config, connection })).toBe('https://api.example.com/botstored-token/stored-token/sandbox/stored-secret');
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'provider_base_url',
            credentialType: 'connection_credentials',
            fields: ['apiKey']
        });
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'caller_endpoint',
            credentialType: 'connection_credentials',
            fields: ['credentials.apiKey']
        });
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'caller_endpoint',
            credentialType: 'connection_config',
            fields: ['connection_config.secretField']
        });
        expect(config.onSecretInterpolation).toHaveBeenCalledTimes(3);
    });

    it('distinguishes caller overrides and provider-owned verification URLs', () => {
        const config = configuration();
        config.baseUrlOverride = 'https://api.example.com/${apiKey}';
        buildProxyURL({ config, connection });
        expect(config.onSecretInterpolation).toHaveBeenCalledWith(expect.objectContaining({ location: 'caller_base_url_override' }));
        vi.mocked(config.onSecretInterpolation!).mockClear();
        config.urlTemplateSource = 'verification';
        buildProxyURL({ config, connection });
        expect(config.onSecretInterpolation).toHaveBeenCalledWith(expect.objectContaining({ location: 'verification_base_url_override' }));
        expect(config.onSecretInterpolation).toHaveBeenCalledWith(expect.objectContaining({ location: 'verification_endpoint' }));
        expect(config.onSecretInterpolation).not.toHaveBeenCalledWith(expect.objectContaining({ location: 'caller_endpoint' }));
    });

    it('observes provider headers, query and nested body templates', () => {
        const config = configuration();
        config.provider.proxy = {
            base_url: 'https://api.example.com',
            headers: { 'x-api-key': '${apiKey}', 'x-config-secret': '${connectionConfig.secretField}' },
            query: { token: '${credentials.apiKey}' },
            body: { auth: { token: '${apiKey}' } }
        };
        const url = buildProxyURL({ config, connection });
        expect(new URL(url).searchParams.get('token')).toBe('stored-token');
        expect(buildProxyHeaders({ config, connection, url })).toMatchObject({ 'x-api-key': 'stored-token', 'x-config-secret': 'stored-secret' });
        expect(buildProxyBody({ config, connection })).toEqual({ auth: { token: 'stored-token' } });
        for (const location of ['provider_header', 'provider_query', 'provider_body']) {
            expect(config.onSecretInterpolation).toHaveBeenCalledWith(expect.objectContaining({ location, credentialType: 'connection_credentials' }));
        }
    });

    it('identifies integration credential aliases in OAuth headers', () => {
        const config = configuration();
        config.provider.proxy = {
            base_url: 'https://api.example.com',
            headers: { 'x-api-key': '${clientId}:${clientSecret}', authorization: 'Bearer ${accessToken}' }
        };
        const oauthConnection = getTestConnection({ credentials: { type: 'OAUTH2', access_token: 'oauth-token', raw: {} } });
        expect(
            buildProxyHeaders({
                config,
                connection: oauthConnection,
                url: 'https://api.example.com',
                integrationConfig: { oauth_client_id: 'client-id', oauth_client_secret: 'client-secret' }
            })['x-api-key']
        ).toBe('client-id:client-secret');
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'provider_header',
            credentialType: 'integration_credentials',
            fields: ['clientId', 'clientSecret']
        });
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'provider_header',
            credentialType: 'connection_credentials',
            fields: ['accessToken']
        });
    });

    it('only observes resolved fields in the selected fallback branch, including transformations', () => {
        const config = configuration();
        const replacers = { credentials: connection.credentials, connectionConfig: connection.connection_config };
        expect(interpolateProxyTemplate('${connectionConfig.environment}||${credentials.apiKey}', replacers, config, connection, 'caller_endpoint')).toBe(
            'sandbox'
        );
        expect(interpolateProxyTemplate('${credentials.missing}', replacers, config, connection, 'caller_endpoint')).toBe('${credentials.missing}');
        expect(config.onSecretInterpolation).not.toHaveBeenCalled();
        expect(interpolateProxyTemplate('${base64(${credentials.apiKey})}', replacers, config, connection, 'caller_endpoint')).toBe(
            Buffer.from('stored-token').toString('base64')
        );
        expect(config.onSecretInterpolation).toHaveBeenCalledWith({
            location: 'caller_endpoint',
            credentialType: 'connection_credentials',
            fields: ['credentials.apiKey']
        });
    });

    it('preserves successful interpolation if monitoring fails', () => {
        const config = configuration();
        config.onSecretInterpolation = () => {
            throw new Error('monitor unavailable');
        };
        expect(buildProxyURL({ config, connection })).toContain('/stored-token/sandbox/stored-secret');
    });

    it('only accepts monitoring provenance from internal configuration', () => {
        const spoofed = { ...configuration(), urlTemplateSource: 'verification' as const };
        const actual = getProxyConfiguration({ externalConfig: spoofed, internalConfig: { providerName: 'github' } }).unwrap();
        expect(actual.urlTemplateSource).toBeUndefined();
        expect(actual.onSecretInterpolation).toBeUndefined();
    });
});

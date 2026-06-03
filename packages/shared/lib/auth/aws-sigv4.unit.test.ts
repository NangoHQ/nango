import { describe, expect, it } from 'vitest';

import { extractSecretsFromConfig, getAwsSigV4Settings, parseAssumeRoleResponse, validateStsEndpointUrl } from './aws-sigv4.js';

import type { Config as ProviderConfig } from '../models/Provider.js';

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 1,
        unique_key: 'aws-sigv4',
        provider: 'aws-sigv4',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_scopes: '',
        environment_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
        missing_fields: [],
        ...overrides
    } as ProviderConfig;
}

describe('parseAssumeRoleResponse', () => {
    it('extracts credentials from valid STS AssumeRole XML', () => {
        const xml = `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIATESTACCESSKEY</AccessKeyId>
      <SecretAccessKey>testSecretAccessKey123</SecretAccessKey>
      <SessionToken>testSessionToken456</SessionToken>
      <Expiration>2025-01-02T04:04:05Z</Expiration>
    </Credentials>
    <AssumedRoleUser>
      <Arn>arn:aws:sts::123456789012:assumed-role/TestRole/nango-session</Arn>
      <AssumedRoleId>AROA3XFRBF23:nango-session</AssumedRoleId>
    </AssumedRoleUser>
  </AssumeRoleResult>
</AssumeRoleResponse>`;

        const result = parseAssumeRoleResponse(xml);
        expect(result).not.toBeNull();
        expect(result!.accessKeyId).toBe('ASIATESTACCESSKEY');
        expect(result!.secretAccessKey).toBe('testSecretAccessKey123');
        expect(result!.sessionToken).toBe('testSessionToken456');
        expect(result!.expiresAt).toEqual(new Date('2025-01-02T04:04:05Z'));
    });

    it('extracts credentials from valid STS AssumeRole JSON', () => {
        const json = JSON.stringify({
            AssumeRoleResponse: {
                AssumeRoleResult: {
                    AssumedRoleUser: {
                        Arn: 'arn:aws:sts::123456789012:assumed-role/TestRole/nango-session',
                        AssumedRoleId: 'AROA3XFRBF23:nango-session'
                    },
                    Credentials: {
                        AccessKeyId: 'ASIATESTACCESSKEY',
                        Expiration: 1772146564,
                        SecretAccessKey: 'testSecretAccessKey123',
                        SessionToken: 'testSessionToken456'
                    }
                }
            }
        });

        const result = parseAssumeRoleResponse(json);
        expect(result).not.toBeNull();
        expect(result!.accessKeyId).toBe('ASIATESTACCESSKEY');
        expect(result!.secretAccessKey).toBe('testSecretAccessKey123');
        expect(result!.sessionToken).toBe('testSessionToken456');
        expect(result!.expiresAt).toEqual(new Date(1772146564 * 1000));
    });

    it('extracts credentials from JSON with ISO-8601 string Expiration', () => {
        const json = JSON.stringify({
            AssumeRoleResponse: {
                AssumeRoleResult: {
                    Credentials: {
                        AccessKeyId: 'ASIATESTACCESSKEY',
                        Expiration: '2025-01-02T04:04:05Z',
                        SecretAccessKey: 'testSecretAccessKey123',
                        SessionToken: 'testSessionToken456'
                    }
                }
            }
        });

        const result = parseAssumeRoleResponse(json);
        expect(result).not.toBeNull();
        expect(result!.expiresAt).toEqual(new Date('2025-01-02T04:04:05Z'));
    });

    it('returns null for XML missing required fields', () => {
        const xml = `<AssumeRoleResponse><AssumeRoleResult><Credentials><AccessKeyId>key</AccessKeyId></Credentials></AssumeRoleResult></AssumeRoleResponse>`;
        expect(parseAssumeRoleResponse(xml)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseAssumeRoleResponse('')).toBeNull();
    });
});

describe('getAwsSigV4Settings', () => {
    it('accepts builtin mode with credentials in integration_secrets', () => {
        const config = makeConfig({
            custom: {
                aws_sigv4_config: JSON.stringify({ service: 's3', stsMode: 'builtin' })
            },
            integration_secrets: {
                aws_sigv4: {
                    sts_credentials: {
                        aws_access_key_id: 'AKIATEST',
                        aws_secret_access_key: 'testSecret'
                    }
                }
            }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.stsMode).toBe('builtin');
            expect(result.value.builtinCredentials).toEqual({
                awsAccessKeyId: 'AKIATEST',
                awsSecretAccessKey: 'testSecret'
            });
            expect(result.value.stsEndpoint).toBeUndefined();
        }
    });

    it('rejects builtin mode without credentials', () => {
        const config = makeConfig({
            custom: {
                aws_sigv4_config: JSON.stringify({ service: 's3', stsMode: 'builtin' })
            }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('missing_aws_sigv4_builtin_credentials');
        }
    });

    it('defaults to custom mode when stsMode is omitted', () => {
        const config = makeConfig({
            custom: {
                aws_sigv4_config: JSON.stringify({ service: 's3', stsEndpoint: { url: 'https://sts.example.com' } })
            }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.stsMode).toBe('custom');
            expect(result.value.stsEndpoint?.url).toBe('https://sts.example.com');
        }
    });

    it('rejects custom mode without stsEndpoint.url', () => {
        const config = makeConfig({
            custom: {
                aws_sigv4_config: JSON.stringify({ service: 's3' })
            }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('missing_aws_sigv4_sts_endpoint');
        }
    });
});

describe('extractSecretsFromConfig', () => {
    it('extracts builtin credentials from config', () => {
        const parsed = {
            service: 's3',
            stsMode: 'builtin',
            awsAccessKeyId: 'AKIATEST',
            awsSecretAccessKey: 'secret123'
        };

        const { cleanedJson, stsAuth, builtinCredentials } = extractSecretsFromConfig(parsed);
        const cleaned = JSON.parse(cleanedJson);

        expect(cleaned.awsAccessKeyId).toBeUndefined();
        expect(cleaned.awsSecretAccessKey).toBeUndefined();
        expect(cleaned.stsMode).toBe('builtin');
        expect(cleaned.service).toBe('s3');
        expect(stsAuth).toBeNull();
        expect(builtinCredentials).toEqual({
            aws_access_key_id: 'AKIATEST',
            aws_secret_access_key: 'secret123'
        });
    });

    it('extracts STS auth from custom mode config', () => {
        const parsed = {
            service: 's3',
            stsEndpoint: {
                url: 'https://example.com',
                auth: { type: 'api_key', header: 'x-api-key', value: 'secret-key' }
            }
        };

        const { cleanedJson, stsAuth, builtinCredentials } = extractSecretsFromConfig(parsed);
        const cleaned = JSON.parse(cleanedJson);

        expect(cleaned.stsEndpoint.auth).toBeUndefined();
        expect(cleaned.stsEndpoint.url).toBe('https://example.com');
        expect(stsAuth).toEqual({ type: 'api_key', header: 'x-api-key', value: 'secret-key' });
        expect(builtinCredentials).toBeNull();
    });
});

describe('validateStsEndpointUrl', () => {
    it('accepts a public HTTPS URL', () => {
        const res = validateStsEndpointUrl('https://nexus-sts.example.com/assume-role');
        expect(res.isOk()).toBe(true);
    });

    it('rejects http:// scheme', () => {
        const res = validateStsEndpointUrl('http://nexus-sts.example.com/assume-role');
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            const payloadMessage = (res.error.payload as { message?: string } | undefined)?.message;
            expect(payloadMessage).toMatch(/HTTPS/);
        }
    });

    it('rejects malformed URLs', () => {
        const res = validateStsEndpointUrl('not a url');
        expect(res.isErr()).toBe(true);
    });

    it('rejects literal localhost / loopback', () => {
        for (const url of ['https://localhost/x', 'https://127.0.0.1/x', 'https://127.42.0.5/x', 'https://0.0.0.0/x']) {
            const res = validateStsEndpointUrl(url);
            expect(res.isErr(), `expected ${url} to be rejected`).toBe(true);
        }
    });

    it('rejects AWS instance metadata (169.254.169.254) and the entire link-local range', () => {
        for (const url of ['https://169.254.169.254/latest/meta-data/', 'https://169.254.0.1/x', 'https://169.254.42.99/x']) {
            const res = validateStsEndpointUrl(url);
            expect(res.isErr(), `expected ${url} to be rejected`).toBe(true);
        }
    });

    it('rejects RFC1918 private IPv4 ranges', () => {
        for (const url of [
            'https://10.0.0.1/x',
            'https://10.255.255.254/x',
            'https://172.16.0.1/x',
            'https://172.31.255.254/x',
            'https://192.168.1.1/x',
            'https://100.64.0.1/x' // carrier-grade NAT
        ]) {
            const res = validateStsEndpointUrl(url);
            expect(res.isErr(), `expected ${url} to be rejected`).toBe(true);
        }
    });

    it('rejects IPv6 loopback, unique-local, and link-local addresses', () => {
        for (const url of ['https://[::1]/x', 'https://[fc00::1]/x', 'https://[fd12:3456::1]/x', 'https://[fe80::1]/x']) {
            const res = validateStsEndpointUrl(url);
            expect(res.isErr(), `expected ${url} to be rejected`).toBe(true);
        }
    });

    it('accepts IPs outside the blocked ranges (defense-in-depth: still verify behavior is not overly aggressive)', () => {
        // Not exhaustive — just confirm we don't accidentally over-block. Real STS endpoints
        // use public DNS hostnames in practice, but a literal public IP should also work.
        for (const url of ['https://8.8.8.8/x', 'https://172.15.0.1/x', 'https://172.32.0.1/x', 'https://169.253.0.1/x']) {
            const res = validateStsEndpointUrl(url);
            expect(res.isOk(), `expected ${url} to be accepted`).toBe(true);
        }
    });

    it('honors NANGO_ALLOW_PRIVATE_STS_ENDPOINT=true for local dev (but still requires https)', () => {
        const previous = process.env['NANGO_ALLOW_PRIVATE_STS_ENDPOINT'];
        process.env['NANGO_ALLOW_PRIVATE_STS_ENDPOINT'] = 'true';
        try {
            // Private hosts are now allowed
            for (const url of ['https://localhost:8443/x', 'https://127.0.0.1:8443/x', 'https://192.168.1.10/x']) {
                const res = validateStsEndpointUrl(url);
                expect(res.isOk(), `expected ${url} to be accepted with dev flag`).toBe(true);
            }
            // HTTPS requirement is unconditional — even with the dev flag, http:// is rejected
            const httpRes = validateStsEndpointUrl('http://localhost:8443/x');
            expect(httpRes.isErr()).toBe(true);
        } finally {
            if (previous === undefined) {
                delete process.env['NANGO_ALLOW_PRIVATE_STS_ENDPOINT'];
            } else {
                process.env['NANGO_ALLOW_PRIVATE_STS_ENDPOINT'] = previous;
            }
        }
    });
});

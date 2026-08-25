import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance } from '@nangohq/utils';

import { assertSafeOAuthUrl } from '../services/proxy/outbound-policy.js';
import { fetchAwsTemporaryCredentials, getAwsSigV4Settings, isValidAwsRegion, parseAssumeRoleResponse } from './aws-sigv4.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { AwsSigV4IntegrationSettings } from './aws-sigv4.js';
import type { AddressInfo } from 'node:net';

// The STS AssumeRole call goes through the OAuth egress policy. Neutralise the policy so a local test
// server is reachable (loopback is always blocked by the real policy) while still asserting the URL guard.
vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        // `proxy: false` keeps axios off any ambient HTTP(S)_PROXY so the loopback test server is reached directly.
        getOAuthAxiosRequestConfig: vi.fn(() => ({ proxy: false }))
    };
});

async function withServer(handler: http.RequestListener, fn: (baseUrl: string) => Promise<void>): Promise<void> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

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
    it('accepts builtin mode with credentials in the flat custom fields', () => {
        const config = makeConfig({
            custom: { service: 's3', stsMode: 'builtin', awsAccessKeyId: 'AKIATEST', awsSecretAccessKey: 'testSecret' }
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
        const config = makeConfig({ custom: { service: 's3', stsMode: 'builtin' } });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('missing_aws_sigv4_builtin_credentials');
        }
    });

    it('rejects a config without a service', () => {
        const config = makeConfig({ custom: { stsMode: 'builtin' } });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('missing_aws_sigv4_service');
        }
    });

    it('defaults to custom mode when stsMode is omitted', () => {
        const config = makeConfig({ custom: { service: 's3', stsEndpointUrl: 'https://sts.example.com' } });

        const result = getAwsSigV4Settings(config);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.stsMode).toBe('custom');
            expect(result.value.stsEndpoint?.url).toBe('https://sts.example.com');
        }
    });

    it('reads api_key auth from the flat custom fields', () => {
        const config = makeConfig({
            custom: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://sts.example.com', stsAuthType: 'api_key', stsApiKey: 'secret-key' }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.stsEndpoint?.auth).toEqual({ type: 'api_key', header: 'x-api-key', value: 'secret-key' });
        }
    });

    it('rejects custom mode without an STS endpoint URL', () => {
        const config = makeConfig({ custom: { service: 's3', stsMode: 'custom' } });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('missing_aws_sigv4_sts_endpoint');
        }
    });

    it('rejects api_key STS auth without an API key (instead of silently dropping auth)', () => {
        const config = makeConfig({
            custom: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://sts.example.com', stsAuthType: 'api_key' }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('invalid_aws_sigv4_config');
        }
    });

    it('rejects basic STS auth without a password', () => {
        const config = makeConfig({
            custom: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://sts.example.com', stsAuthType: 'basic', stsAuthUsername: 'u' }
        });

        const result = getAwsSigV4Settings(config);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('invalid_aws_sigv4_config');
        }
    });

    it('accepts custom mode with no auth (stsAuthType none)', () => {
        const config = makeConfig({ custom: { service: 's3', stsMode: 'custom', stsEndpointUrl: 'https://sts.example.com', stsAuthType: 'none' } });

        const result = getAwsSigV4Settings(config);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.stsEndpoint?.auth).toBeUndefined();
        }
    });
});

describe('fetchAwsTemporaryCredentials', () => {
    afterEach(() => {
        // Restores the per-test axios spy created via vi.spyOn; the factory vi.fn mocks keep their default
        // implementations and their (assertion-irrelevant) call history across tests.
        vi.restoreAllMocks();
    });

    const input = { roleArn: 'arn:aws:iam::123456789012:role/TestRole', externalId: 'external-123', region: 'us-east-1' };

    const stsXml = `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIABUILTIN</AccessKeyId>
      <SecretAccessKey>builtinSecret</SecretAccessKey>
      <SessionToken>builtinSession</SessionToken>
      <Expiration>2035-01-02T04:04:05Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>`;

    it('builtin mode: assumes the role against the region STS endpoint and validates the URL', async () => {
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({ status: 200, data: stsXml });

        const settings: AwsSigV4IntegrationSettings = {
            service: 's3',
            stsMode: 'builtin',
            defaultRegion: 'us-east-1',
            builtinCredentials: { awsAccessKeyId: 'AKIATEST', awsSecretAccessKey: 'secret' }
        };

        const result = await fetchAwsTemporaryCredentials({ settings, input });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.accessKeyId).toBe('ASIABUILTIN');
            expect(result.value.sessionToken).toBe('builtinSession');
        }
        // The built-in STS URL is now validated through the egress policy, matching the custom path.
        expect(assertSafeOAuthUrl).toHaveBeenCalledWith('https://sts.us-east-1.amazonaws.com/');
        expect(postSpy).toHaveBeenCalledOnce();
    });

    it('builtin mode: refresh re-runs the guarded assume-role call', async () => {
        // AWS_SIGV4 refresh re-invokes fetchAwsTemporaryCredentials (connection.service), so a repeat call must succeed.
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({ status: 200, data: stsXml });
        const settings: AwsSigV4IntegrationSettings = {
            service: 's3',
            stsMode: 'builtin',
            defaultRegion: 'us-east-1',
            builtinCredentials: { awsAccessKeyId: 'AKIATEST', awsSecretAccessKey: 'secret' }
        };

        const first = await fetchAwsTemporaryCredentials({ settings, input });
        const refreshed = await fetchAwsTemporaryCredentials({ settings, input });

        expect(first.isOk()).toBe(true);
        expect(refreshed.isOk()).toBe(true);
        expect(postSpy).toHaveBeenCalledTimes(2);
    });

    it('builtin mode: does not call STS when the URL is blocked by policy', async () => {
        vi.mocked(assertSafeOAuthUrl).mockRejectedValueOnce(new Error('URL resolves to a blocked address'));
        const postSpy = vi.spyOn(axiosInstance, 'post');

        const settings: AwsSigV4IntegrationSettings = {
            service: 's3',
            stsMode: 'builtin',
            defaultRegion: 'us-east-1',
            builtinCredentials: { awsAccessKeyId: 'AKIATEST', awsSecretAccessKey: 'secret' }
        };

        const result = await fetchAwsTemporaryCredentials({ settings, input });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.type).toBe('aws_sigv4_sts_request_failed');
        }
        expect(postSpy).not.toHaveBeenCalled();
    });

    it('custom mode: fetches credentials from the custom STS endpoint end-to-end', async () => {
        await withServer(
            (_req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(
                    JSON.stringify({
                        accessKeyId: 'ASIACUSTOM',
                        secretAccessKey: 'customSecret',
                        sessionToken: 'customSession',
                        expiration: new Date('2035-01-02T04:04:05Z').toISOString()
                    })
                );
            },
            async (baseUrl) => {
                const settings: AwsSigV4IntegrationSettings = {
                    service: 's3',
                    stsMode: 'custom',
                    defaultRegion: 'us-east-1',
                    stsEndpoint: { url: `${baseUrl}/sts` }
                };

                const result = await fetchAwsTemporaryCredentials({ settings, input });

                expect(result.isOk()).toBe(true);
                if (result.isOk()) {
                    expect(result.value.accessKeyId).toBe('ASIACUSTOM');
                    expect(result.value.sessionToken).toBe('customSession');
                }
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/sts`);
            }
        );
    });
});

describe('isValidAwsRegion', () => {
    it('accepts real AWS region shapes', () => {
        for (const region of ['us-east-1', 'eu-west-2', 'ap-southeast-1', 'us-gov-west-1', 'cn-north-1']) {
            expect(isValidAwsRegion(region), region).toBe(true);
        }
    });

    it('rejects values that could inject a different host', () => {
        for (const region of [
            '169.254.169.254#', // metadata via fragment trick
            'evil.com#',
            'us-east-1/',
            'us-east-1?x=1',
            'foo@evil.com',
            'us-east-1.evil.com',
            'US-EAST-1', // uppercase
            'us_east_1', // underscore
            '',
            ' us-east-1'
        ]) {
            expect(isValidAwsRegion(region), region).toBe(false);
        }
    });
});

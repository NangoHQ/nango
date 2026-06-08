import { describe, expect, it } from 'vitest';

import { getAwsSigV4Settings, isValidAwsRegion, parseAssumeRoleResponse } from './aws-sigv4.js';

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

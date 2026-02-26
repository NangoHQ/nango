import { describe, expect, it } from 'vitest';

import { extractSecretsFromConfig, getAwsSigV4Settings, parseAssumeRoleResponse } from './aws-sigv4.js';

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
    it('extracts builtin credentials from config JSON', () => {
        const raw = JSON.stringify({
            service: 's3',
            stsMode: 'builtin',
            awsAccessKeyId: 'AKIATEST',
            awsSecretAccessKey: 'secret123'
        });

        const { cleanedJson, stsAuth, builtinCredentials } = extractSecretsFromConfig(raw);
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

    it('extracts STS auth from custom mode config JSON', () => {
        const raw = JSON.stringify({
            service: 's3',
            stsEndpoint: {
                url: 'https://example.com',
                auth: { type: 'api_key', header: 'x-api-key', value: 'secret-key' }
            }
        });

        const { cleanedJson, stsAuth, builtinCredentials } = extractSecretsFromConfig(raw);
        const cleaned = JSON.parse(cleanedJson);

        expect(cleaned.stsEndpoint.auth).toBeUndefined();
        expect(cleaned.stsEndpoint.url).toBe('https://example.com');
        expect(stsAuth).toEqual({ type: 'api_key', header: 'x-api-key', value: 'secret-key' });
        expect(builtinCredentials).toBeNull();
    });

    it('handles invalid JSON gracefully', () => {
        const { cleanedJson, stsAuth, builtinCredentials } = extractSecretsFromConfig('not-json');
        expect(cleanedJson).toBe('not-json');
        expect(stsAuth).toBeNull();
        expect(builtinCredentials).toBeNull();
    });
});

import crypto from 'node:crypto';

import { axiosInstance as axios, Err, getLogger, Ok, stringifyError } from '@nangohq/utils';

import { signAwsSigV4Request } from '../services/proxy/aws-sigv4.js';
import { NangoError } from '../utils/error.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { AwsSigV4Credentials } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('aws-sigv4');

type StsAuth = { type: 'api_key'; header: string; value: string } | { type: 'basic'; username: string; password: string };

export type StsMode = 'builtin' | 'custom';

export interface BuiltinAwsCredentials {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
}

export interface AwsSigV4IntegrationSettings {
    service: string;
    stsMode: StsMode;
    defaultRegion?: string;
    stsEndpoint?: {
        url: string;
        auth?: StsAuth;
    };
    builtinCredentials?: BuiltinAwsCredentials;
}

export interface AwsSigV4AssumeRoleInput {
    roleArn: string;
    externalId: string;
    region?: string;
}

export interface AwsSigV4TemporaryCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiresAt: Date;
}

/**
 * Build the AWS SigV4 integration settings from the integration's `custom` fields. SigV4 config is
 * stored as flat `integration_config` keys (see providers.yaml); secrets live in the encrypted
 * `custom` field and are redacted by the API formatter on read. Cross-field requirements (built-in
 * credentials, STS endpoint, auth secrets) are enforced here at connection time rather than at save.
 */
export function getAwsSigV4Settings(config: ProviderConfig): Result<AwsSigV4IntegrationSettings, NangoError> {
    const custom = config.custom ?? {};

    const service = custom['service'];
    if (!service) {
        return Err(new NangoError('missing_aws_sigv4_service'));
    }

    const stsMode: StsMode = custom['stsMode'] === 'builtin' ? 'builtin' : 'custom';

    const settings: AwsSigV4IntegrationSettings = { service, stsMode };

    if (stsMode === 'builtin') {
        const builtinCreds = getBuiltinCredentialsFromConfig(custom);
        if (!builtinCreds) {
            return Err(new NangoError('missing_aws_sigv4_builtin_credentials'));
        }
        settings.builtinCredentials = builtinCreds;
    } else {
        const url = custom['stsEndpointUrl'];
        if (!url) {
            return Err(new NangoError('missing_aws_sigv4_sts_endpoint'));
        }
        // Fail fast on a half-configured auth selection rather than silently sending an unauthenticated
        // STS request (which would surface as an opaque 401/403 from the endpoint at connect time).
        const authType = custom['stsAuthType'];
        if (authType === 'api_key' && !custom['stsApiKey']) {
            return Err(new NangoError('invalid_aws_sigv4_config', { message: 'STS API key is required when STS auth type is api_key' }));
        }
        if (authType === 'basic' && !custom['stsAuthPassword']) {
            return Err(new NangoError('invalid_aws_sigv4_config', { message: 'STS password is required when STS auth type is basic' }));
        }
        const stsAuth = getStsAuthFromConfig(custom);
        settings.stsEndpoint = {
            url,
            ...(stsAuth ? { auth: stsAuth } : {})
        };
    }

    if (custom['defaultRegion']) {
        settings.defaultRegion = custom['defaultRegion'];
    }

    return Ok(settings);
}

function getBuiltinCredentialsFromConfig(custom: Record<string, string>): BuiltinAwsCredentials | null {
    if (custom['awsAccessKeyId'] && custom['awsSecretAccessKey']) {
        return {
            awsAccessKeyId: custom['awsAccessKeyId'],
            awsSecretAccessKey: custom['awsSecretAccessKey']
        };
    }
    return null;
}

function getStsAuthFromConfig(custom: Record<string, string>): StsAuth | undefined {
    const type = custom['stsAuthType'];
    if (type === 'api_key' && custom['stsApiKey']) {
        return { type: 'api_key', header: custom['stsAuthHeader'] || 'x-api-key', value: custom['stsApiKey'] };
    }
    if (type === 'basic' && custom['stsAuthPassword']) {
        return { type: 'basic', username: custom['stsAuthUsername'] || '', password: custom['stsAuthPassword'] };
    }
    return undefined;
}

export async function fetchAwsTemporaryCredentials({
    settings,
    input
}: {
    settings: AwsSigV4IntegrationSettings;
    input: AwsSigV4AssumeRoleInput;
}): Promise<Result<AwsSigV4TemporaryCredentials, NangoError>> {
    if (settings.stsMode === 'builtin') {
        return fetchAwsTemporaryCredentialsBuiltin({ settings, input });
    }
    return fetchAwsTemporaryCredentialsCustom({ settings, input });
}

async function fetchAwsTemporaryCredentialsBuiltin({
    settings,
    input
}: {
    settings: AwsSigV4IntegrationSettings;
    input: AwsSigV4AssumeRoleInput;
}): Promise<Result<AwsSigV4TemporaryCredentials, NangoError>> {
    const region = input.region || settings.defaultRegion;
    if (!region) {
        return Err(new NangoError('missing_aws_sigv4_region'));
    }

    if (!isValidAwsRegion(region)) {
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: 'Invalid AWS region' }));
    }

    if (!settings.builtinCredentials) {
        return Err(new NangoError('missing_aws_sigv4_builtin_credentials'));
    }

    const stsUrl = `https://sts.${region}.amazonaws.com/`;
    const sessionName = `nango-${crypto.randomBytes(8).toString('hex')}`;
    const body = [
        'Action=AssumeRole',
        `RoleArn=${encodeURIComponent(input.roleArn)}`,
        `ExternalId=${encodeURIComponent(input.externalId)}`,
        `RoleSessionName=${encodeURIComponent(sessionName)}`,
        'DurationSeconds=3600',
        'Version=2011-06-15'
    ].join('&');

    // Build a temporary credentials object to sign the STS request with the owner's long-lived keys
    const signingCredentials: AwsSigV4Credentials = {
        type: 'AWS_SIGV4',
        raw: {},
        role_arn: '',
        region,
        service: 'sts',
        access_key_id: settings.builtinCredentials.awsAccessKeyId,
        secret_access_key: settings.builtinCredentials.awsSecretAccessKey,
        session_token: ''
    };

    const signedHeaders = signAwsSigV4Request({
        url: stsUrl,
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        credentials: signingCredentials
    });

    try {
        const response = await axios.post(stsUrl, body, {
            headers: signedHeaders,
            transformResponse: [(data: unknown) => data] // keep raw XML
        });

        const creds = parseAssumeRoleResponse(response.data as string);
        if (!creds) {
            logger.error('AWS STS AssumeRole returned invalid response', response.data);
            return Err(new NangoError('aws_sigv4_sts_request_failed', { message: 'STS returned a response but credentials could not be parsed' }));
        }
        return Ok(creds);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : stringifyError(err);
        logger.error('Failed to call AWS STS AssumeRole', errorMessage);
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: `STS request failed: ${errorMessage}` }));
    }
}

async function fetchAwsTemporaryCredentialsCustom({
    settings,
    input
}: {
    settings: AwsSigV4IntegrationSettings;
    input: AwsSigV4AssumeRoleInput;
}): Promise<Result<AwsSigV4TemporaryCredentials, NangoError>> {
    const region = input.region || settings.defaultRegion;
    if (!region) {
        return Err(new NangoError('missing_aws_sigv4_region'));
    }

    if (!settings.stsEndpoint?.url) {
        return Err(new NangoError('missing_aws_sigv4_sts_endpoint'));
    }

    const payload = {
        role_arn: input.roleArn,
        external_id: input.externalId,
        region,
        service: settings.service
    };

    const headers: Record<string, string> = {
        'content-type': 'application/json'
    };

    if (settings.stsEndpoint.auth) {
        if (settings.stsEndpoint.auth.type === 'api_key') {
            headers[settings.stsEndpoint.auth.header] = settings.stsEndpoint.auth.value;
        } else if (settings.stsEndpoint.auth.type === 'basic') {
            const token = Buffer.from(`${settings.stsEndpoint.auth.username}:${settings.stsEndpoint.auth.password}`).toString('base64');
            headers['authorization'] = `Basic ${token}`;
        }
    }

    try {
        const response = await axios.post(settings.stsEndpoint.url, payload, { headers });
        const creds = normalizeStsResponse(response.data);
        if (!creds) {
            return Err(
                new NangoError('aws_sigv4_sts_request_failed', { message: 'Custom STS endpoint returned a response but credentials could not be parsed' })
            );
        }
        return Ok(creds);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : stringifyError(err);
        logger.error('Failed to fetch AWS credentials from STS endpoint', errorMessage);
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: `Custom STS request failed: ${errorMessage}` }));
    }
}

function normalizeStsResponse(data: any): AwsSigV4TemporaryCredentials | null {
    if (!data) {
        return null;
    }

    const payload = 'credentials' in data ? data.credentials : data;
    const accessKeyId = payload.accessKeyId || payload.access_key_id;
    const secretAccessKey = payload.secretAccessKey || payload.secret_access_key;
    const sessionToken = payload.sessionToken || payload.session_token;
    const expiresAtRaw = payload.expiresAt || payload.expires_at || payload.expiration;

    if (!accessKeyId || !secretAccessKey || !sessionToken) {
        return null;
    }

    let expiresAt: Date;
    if (expiresAtRaw == null) {
        expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    } else if (typeof expiresAtRaw === 'number') {
        // Custom STS endpoints vary: some return Unix seconds, others milliseconds.
        // Anything below 1e12 (Sept 2001 if treated as ms) must be seconds.
        expiresAt = new Date(expiresAtRaw < 1e12 ? expiresAtRaw * 1000 : expiresAtRaw);
    } else {
        expiresAt = new Date(expiresAtRaw);
    }

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt
    };
}

/**
 * Parse the response from AWS STS AssumeRole.
 * Handles both XML and JSON response formats.
 */
export function parseAssumeRoleResponse(responseBody: string): AwsSigV4TemporaryCredentials | null {
    // Try JSON first (axios default Accept header may cause AWS to return JSON)
    try {
        const json = JSON.parse(responseBody);
        const creds = json?.AssumeRoleResponse?.AssumeRoleResult?.Credentials;
        if (creds?.AccessKeyId && creds?.SecretAccessKey && creds?.SessionToken) {
            let expiresAt: Date;
            if (typeof creds.Expiration === 'number') {
                expiresAt = new Date(creds.Expiration * 1000);
            } else if (typeof creds.Expiration === 'string') {
                expiresAt = new Date(creds.Expiration);
            } else {
                expiresAt = new Date(Date.now() + 60 * 60 * 1000);
            }
            return {
                accessKeyId: creds.AccessKeyId,
                secretAccessKey: creds.SecretAccessKey,
                sessionToken: creds.SessionToken,
                expiresAt
            };
        }
    } catch {
        // Not JSON, try XML
    }

    // Fall back to XML parsing
    const accessKeyId = extractXmlTag(responseBody, 'AccessKeyId');
    const secretAccessKey = extractXmlTag(responseBody, 'SecretAccessKey');
    const sessionToken = extractXmlTag(responseBody, 'SessionToken');
    const expiration = extractXmlTag(responseBody, 'Expiration');

    if (!accessKeyId || !secretAccessKey || !sessionToken) {
        return null;
    }

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt: expiration ? new Date(expiration) : new Date(Date.now() + 60 * 60 * 1000)
    };
}

function extractXmlTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return match?.[1] ?? null;
}

/**
 * AWS region tokens are lowercase letters, digits, and hyphens (e.g. `us-east-1`, `eu-west-2`,
 * `us-gov-west-1`). Reject anything else: `region` reaches the built-in STS URL
 * (`https://sts.${region}.amazonaws.com/`, signed with the integration owner's long-lived keys) and
 * the proxy base URL, so a value containing `#`, `/`, `?`, `@` or `.` could re-point the host
 * (e.g. `169.254.169.254#` → metadata endpoint). This is a hard SSRF guard, not cosmetic validation.
 */
export function isValidAwsRegion(region: string): boolean {
    return /^[a-z0-9-]{1,64}$/.test(region);
}

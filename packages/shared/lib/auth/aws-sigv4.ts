import crypto from 'node:crypto';

import { Err, Ok, axiosInstance as axios, getLogger, stringifyError } from '@nangohq/utils';

import { signAwsSigV4Request } from '../services/proxy/aws-sigv4.js';
import { NangoError } from '../utils/error.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { AwsSigV4Credentials } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('aws-sigv4');

export const AWS_SIGV4_CUSTOM_KEY = 'aws_sigv4_config';

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

export function getAwsSigV4Settings(config: ProviderConfig): Result<AwsSigV4IntegrationSettings, NangoError> {
    const rawSettings = config.custom?.[AWS_SIGV4_CUSTOM_KEY];
    if (!rawSettings) {
        return Err(new NangoError('missing_aws_sigv4_config'));
    }

    let parsed: Record<string, any>;
    try {
        parsed = JSON.parse(rawSettings);
    } catch (err) {
        logger.error('Failed to parse aws sigv4 config', err);
        return Err(new NangoError('invalid_aws_sigv4_config'));
    }

    if (!parsed['service']) {
        return Err(new NangoError('missing_aws_sigv4_service'));
    }

    const stsMode: StsMode = parsed['stsMode'] === 'builtin' ? 'builtin' : 'custom';

    const settings: AwsSigV4IntegrationSettings = {
        service: parsed['service'],
        stsMode
    };

    if (stsMode === 'builtin') {
        const builtinCreds = getBuiltinCredentialsFromConfig(config);
        if (!builtinCreds) {
            return Err(new NangoError('missing_aws_sigv4_builtin_credentials'));
        }
        settings.builtinCredentials = builtinCreds;
    } else {
        // Custom mode: require stsEndpoint.url
        if (!parsed['stsEndpoint'] || !parsed['stsEndpoint']['url']) {
            return Err(new NangoError('missing_aws_sigv4_sts_endpoint'));
        }
        const stsAuth = getStsAuthFromConfig(config, parsed);
        settings.stsEndpoint = {
            url: parsed['stsEndpoint']['url'],
            ...(stsAuth ? { auth: stsAuth } : {})
        };
    }

    if (parsed['defaultRegion']) {
        settings.defaultRegion = parsed['defaultRegion'];
    }

    return Ok(settings);
}

/**
 * Read built-in AWS credentials from integration_secrets.
 */
function getBuiltinCredentialsFromConfig(config: ProviderConfig): BuiltinAwsCredentials | null {
    const secrets = config.integration_secrets as Record<string, any> | undefined | null;
    const stsCreds = secrets?.['aws_sigv4']?.['sts_credentials'];
    if (stsCreds?.['aws_access_key_id'] && stsCreds?.['aws_secret_access_key']) {
        return {
            awsAccessKeyId: stsCreds['aws_access_key_id'],
            awsSecretAccessKey: stsCreds['aws_secret_access_key']
        };
    }
    return null;
}

/**
 * Read STS auth from integration_secrets (new column) with fallback to legacy custom blob.
 */
function getStsAuthFromConfig(config: ProviderConfig, parsed: Record<string, any>): StsAuth | undefined {
    // New path: read from decrypted integration_secrets.
    // If a structured sts_auth record exists, trust it exclusively — a missing value
    // means the secret wasn't migrated, not a hint to fall back to the raw blob.
    const secrets = config.integration_secrets as Record<string, any> | undefined | null;
    const stsAuthSecret = secrets?.['aws_sigv4']?.['sts_auth'];
    if (stsAuthSecret) {
        if (stsAuthSecret['type'] === 'api_key') {
            if (!stsAuthSecret['value']) {
                return undefined;
            }
            return { type: 'api_key', header: stsAuthSecret['header'] || 'x-api-key', value: stsAuthSecret['value'] };
        }
        if (stsAuthSecret['type'] === 'basic') {
            if (!stsAuthSecret['password']) {
                return undefined;
            }
            return { type: 'basic', username: stsAuthSecret['username'] || '', password: stsAuthSecret['password'] };
        }
        // Unknown type — do not silently proceed
        return undefined;
    }

    // Legacy fallback: read auth from custom blob (pre-migration configs only)
    return parsed['stsEndpoint']?.['auth'];
}

/**
 * Extract secrets from a parsed aws_sigv4_config object.
 * Returns the cleaned JSON (secrets removed), extracted StsAuth, and extracted builtin credentials.
 * Callers are responsible for JSON-parsing and validation before calling this.
 */
export function extractSecretsFromConfig(parsed: Record<string, any>): {
    cleanedJson: string;
    stsAuth: StsAuth | null;
    builtinCredentials: { aws_access_key_id: string; aws_secret_access_key: string } | null;
} {
    const cleaned = { ...parsed };

    // Strip legacy vendor-side onboarding fields that are no longer surfaced by Nango.
    // Setup guidance and IAM role provisioning belong in the integration owner's onboarding flow.
    delete cleaned['templates'];
    delete cleaned['instructions'];

    // Extract builtin AWS credentials
    let builtinCredentials: { aws_access_key_id: string; aws_secret_access_key: string } | null = null;
    if (parsed['stsMode'] === 'builtin' && parsed['awsAccessKeyId'] && parsed['awsSecretAccessKey']) {
        builtinCredentials = {
            aws_access_key_id: parsed['awsAccessKeyId'],
            aws_secret_access_key: parsed['awsSecretAccessKey']
        };
        delete cleaned['awsAccessKeyId'];
        delete cleaned['awsSecretAccessKey'];
    }

    // Extract custom endpoint auth secrets
    let stsAuth: StsAuth | null = null;
    const auth = parsed['stsEndpoint']?.['auth'];
    if (auth) {
        cleaned['stsEndpoint'] = { ...parsed['stsEndpoint'] };
        delete cleaned['stsEndpoint']['auth'];

        if (auth['type'] === 'api_key' && auth['value']) {
            stsAuth = { type: 'api_key', header: auth['header'] || 'x-api-key', value: auth['value'] };
        } else if (auth['type'] === 'basic' && auth['password']) {
            stsAuth = { type: 'basic', username: auth['username'] || '', password: auth['password'] };
        }
    }

    return { cleanedJson: JSON.stringify(cleaned), stsAuth, builtinCredentials };
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

    // Defense in depth against SSRF: an integration owner sets stsEndpoint.url via the
    // PatchIntegration controller, so a compromised owner could otherwise point Nango's
    // outbound request at cloud metadata endpoints (169.254.169.254), loopback, or other
    // internal services. Reject those at the call site before axios establishes a connection.
    // Note: this is hostname-based and does not protect against DNS rebinding; an attacker
    // with a domain that resolves to a private IP at request time can still bypass the check.
    // That would require a custom http agent that re-validates the resolved IP per request.
    const stsUrlCheck = validateStsEndpointUrl(settings.stsEndpoint.url);
    if (stsUrlCheck.isErr()) {
        return Err(stsUrlCheck.error);
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
            logger.error('STS endpoint returned invalid payload', response.data);
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
 * Reject custom STS endpoint URLs that point at private/loopback/link-local addresses or
 * non-HTTPS schemes. Matches the hostname-string allowlist applied in the webapp settings
 * editor (AwsSigV4Settings.tsx) — duplicating it here so a malicious or compromised
 * integration owner can't bypass the UI guard by writing directly to aws_sigv4_config.
 *
 * Set NANGO_ALLOW_PRIVATE_STS_ENDPOINT=true to skip the private-host check for local
 * development (e.g. running nexus-sts on https://localhost). The https:// requirement
 * still applies. Never enable this in production — it re-opens the SSRF vector.
 */
export function validateStsEndpointUrl(rawUrl: string): Result<void, NangoError> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: 'STS endpoint URL is not a valid URL' }));
    }
    if (parsed.protocol !== 'https:') {
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: 'STS endpoint URL must use HTTPS' }));
    }
    const allowPrivateForLocalDev = process.env['NANGO_ALLOW_PRIVATE_STS_ENDPOINT'] === 'true';
    if (!allowPrivateForLocalDev && isPrivateOrLocalHost(parsed.hostname)) {
        return Err(new NangoError('aws_sigv4_sts_request_failed', { message: 'STS endpoint URL cannot point to private, loopback, or link-local addresses' }));
    }
    return Ok(undefined);
}

/**
 * Hostname-based SSRF guard. Best-effort against literal addresses — does not resolve DNS,
 * so a public domain that resolves to a private IP at request time will still slip through.
 */
function isPrivateOrLocalHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0' || h === '[::1]' || h === '::1') {
        return true;
    }
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [, a, b] = ipv4.map(Number) as [number, number, number, number, number];
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true; // link-local, includes 169.254.169.254 (AWS metadata)
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    }
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
    if (/^\[?(fc|fd|fe[89ab])/.test(h)) {
        return true;
    }
    return false;
}

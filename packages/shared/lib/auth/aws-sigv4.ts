import { Err, Ok, axiosInstance as axios, getLogger, stringifyError } from '@nangohq/utils';

import { NangoError } from '../utils/error.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('aws-sigv4');

export const AWS_SIGV4_CUSTOM_KEY = 'aws_sigv4_config';

type StsAuth = { type: 'api_key'; header: string; value: string } | { type: 'basic'; username: string; password: string };

export interface AwsSigV4IntegrationSettings {
    service: string;
    defaultRegion?: string;
    stsEndpoint: {
        url: string;
        auth?: StsAuth;
    };
    instructions?: {
        label?: string;
        url?: string;
        description?: string;
    };
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

    if (!parsed['stsEndpoint'] || !parsed['stsEndpoint']['url']) {
        return Err(new NangoError('missing_aws_sigv4_sts_endpoint'));
    }

    // Read STS auth from integration_secrets (new path) or fall back to custom blob (legacy)
    const stsAuth = getStsAuthFromConfig(config, parsed);

    const settings: AwsSigV4IntegrationSettings = {
        service: parsed['service'],
        stsEndpoint: {
            url: parsed['stsEndpoint']['url'],
            ...(stsAuth ? { auth: stsAuth } : {})
        }
    };

    if (parsed['defaultRegion']) {
        settings.defaultRegion = parsed['defaultRegion'];
    }
    if (parsed['instructions']) {
        settings.instructions = parsed['instructions'];
    }

    return Ok(settings);
}

/**
 * Read STS auth from integration_secrets (new column) with fallback to legacy custom blob.
 */
function getStsAuthFromConfig(config: ProviderConfig, parsed: Record<string, any>): StsAuth | undefined {
    // New path: read from decrypted integration_secrets
    const secrets = config.integration_secrets as Record<string, any> | undefined | null;
    const stsAuthSecret = secrets?.['aws_sigv4']?.['sts_auth'];
    if (stsAuthSecret) {
        if (stsAuthSecret['type'] === 'api_key' && stsAuthSecret['value']) {
            return { type: 'api_key', header: stsAuthSecret['header'] || 'x-api-key', value: stsAuthSecret['value'] };
        }
        if (stsAuthSecret['type'] === 'basic' && stsAuthSecret['password']) {
            return { type: 'basic', username: stsAuthSecret['username'] || '', password: stsAuthSecret['password'] };
        }
    }

    // Legacy fallback: read auth from custom blob
    return parsed['stsEndpoint']?.['auth'];
}

/**
 * Extract STS auth secrets from raw aws_sigv4_config JSON.
 * Returns the cleaned JSON (auth removed) and the extracted StsAuth object.
 * Used by the write path to separate secrets from config.
 */
export function extractStsAuthFromConfig(rawJson: string): { cleanedJson: string; stsAuth: StsAuth | null } {
    let parsed: Record<string, any>;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        return { cleanedJson: rawJson, stsAuth: null };
    }

    const auth = parsed['stsEndpoint']?.['auth'];
    if (!auth) {
        return { cleanedJson: rawJson, stsAuth: null };
    }

    // Remove auth from the config blob — only non-secret config remains
    const cleaned = { ...parsed, stsEndpoint: { ...parsed['stsEndpoint'] } };
    delete cleaned['stsEndpoint']['auth'];

    let stsAuth: StsAuth | null = null;
    if (auth['type'] === 'api_key' && auth['value']) {
        stsAuth = { type: 'api_key', header: auth['header'] || 'x-api-key', value: auth['value'] };
    } else if (auth['type'] === 'basic' && auth['password']) {
        stsAuth = { type: 'basic', username: auth['username'] || '', password: auth['password'] };
    }

    return { cleanedJson: JSON.stringify(cleaned), stsAuth };
}

export async function fetchAwsTemporaryCredentials({
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
            return Err(new NangoError('aws_sigv4_sts_request_failed'));
        }
        return Ok(creds);
    } catch (err) {
        logger.error('Failed to fetch AWS credentials from STS endpoint', stringifyError(err));
        return Err(new NangoError('aws_sigv4_sts_request_failed'));
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

    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : new Date(Date.now() + 60 * 60 * 1000);

    return {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt
    };
}

import { createHash, createHmac } from 'crypto';

import { DEFAULT_OUTBOUND_URL_POLICY, getSafeHttpAgents, validateOutboundUrlSync } from '@nangohq/egress';
import { connectionService, NangoError } from '@nangohq/shared';
import { axiosInstance, Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { ConnectWisePsaWebhookPayload, WebhookHandler } from './types.js';
import type { Result } from '@nangohq/utils';

interface SigningKeyResponse {
    signing_key: string;
}

/**
 * Known trusted ConnectWise subdomains.
 * These are the official ConnectWise PSA API endpoints.
 */
const TRUSTED_CONNECTWISE_SUBDOMAINS = new Set(['api-au', 'api-eu', 'api-na', 'sandbox-au', 'sandbox-eu', 'sandbox-na', 'na', 'eu', 'au']);

/** Only an exact HTTPS origin saved on a connection can extend the cloud defaults. */
function configuredOrigin(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function isCloudKeyUrl(url: URL): boolean {
    const suffix = '.myconnectwise.net';
    return url.host.endsWith(suffix) && TRUSTED_CONNECTWISE_SUBDOMAINS.has(url.host.slice(0, -suffix.length));
}

/** Fetch only after checking the origin against trusted configuration. */
async function fetchSigningKey(url: URL): Promise<Result<string>> {
    try {
        const allowed = validateOutboundUrlSync(url.href, DEFAULT_OUTBOUND_URL_POLICY);
        if (!allowed.ok) return Err(allowed.error);

        // Every key request needs socket-level DNS checks; proxies and redirects must not bypass them.
        const response = await axiosInstance.get<SigningKeyResponse>(url.href, {
            ...getSafeHttpAgents(DEFAULT_OUTBOUND_URL_POLICY),
            proxy: false,
            maxRedirects: 0,
            timeout: 10000,
            maxContentLength: 64 * 1024
        });
        if (typeof response.data?.signing_key !== 'string' || !response.data.signing_key) {
            return Err('webhook_invalid_signing_key');
        }
        return Ok(response.data.signing_key);
    } catch (err) {
        return Err(new Error('webhook_invalid_signing_key', { cause: err }));
    }
}

/**
 * Validates ConnectWise webhook signature
 * Based on: https://developer.connectwise.com/Products/Manage/Developer_Guide#Webhooks
 *
 * The signature is computed as:
 * 1. SHA256 hash of the shared secret key
 * 2. HMAC-SHA256 of the payload using the hashed key
 * 3. Base64 encode the result
 */
function validateSignature(sharedSecretKey: string, headerSignature: string, rawBody: string): boolean {
    try {
        // Step 1: Hash the shared secret key with SHA256
        const keyHash = createHash('sha256').update(sharedSecretKey, 'utf8').digest();

        // Step 2: Compute HMAC-SHA256 of the payload using the hashed key
        const calculatedSignature = createHmac('sha256', keyHash).update(rawBody, 'utf8').digest('base64');

        // Step 3: Compare signatures using timing-safe comparison
        return safeCompare(calculatedSignature, headerSignature);
    } catch {
        return false;
    }
}

const route: WebhookHandler<ConnectWisePsaWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-content-signature'];

    if (!signature || typeof signature !== 'string') {
        return Err(new NangoError('webhook_missing_signature'));
    }

    const keyUrl = body.Metadata?.key_url;

    if (typeof keyUrl !== 'string') {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    let url: URL;
    try {
        url = new URL(keyUrl);
    } catch {
        return Err(new NangoError('webhook_invalid_signature'));
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    let customConnectionIds: string[] | undefined;
    if (!isCloudKeyUrl(url)) {
        if (typeof body.ProductInstanceId !== 'string' || !body.ProductInstanceId) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
        const connections = await connectionService.findConnectionsByMetadataValue({
            metadataProperty: 'productInstanceId',
            payloadIdentifier: body.ProductInstanceId,
            configId: nango.integration.id,
            environmentId: nango.environment.id
        });
        customConnectionIds = (connections || [])
            .filter((connection) => configuredOrigin(connection.metadata?.['connectwiseWebhookKeyOrigin']) === url.origin)
            .map((connection) => connection.connection_id);
        if (customConnectionIds.length === 0) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    const signingKey = await fetchSigningKey(url);

    if (signingKey.isErr() || !validateSignature(signingKey.value, signature, rawBody)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    // Do not fan out a custom-origin event to other connections with the same
    // instance ID: each destination must explicitly trust the signing-key origin.
    const connectionIds: string[] = [];
    if (customConnectionIds) {
        for (const connectionId of customConnectionIds) {
            const response = await nango.executeScriptForWebhooks({
                payload: body,
                webhookType: 'Type',
                connectionIdentifierValue: connectionId,
                propName: 'connectionId'
            });
            connectionIds.push(...response.connectionIds);
        }
    } else {
        const response = await nango.executeScriptForWebhooks({
            payload: body,
            webhookType: 'Type',
            connectionIdentifier: 'ProductInstanceId',
            propName: 'metadata.productInstanceId'
        });
        connectionIds.push(...response.connectionIds);
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;

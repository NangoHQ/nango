import { createHash, createHmac, timingSafeEqual } from 'crypto';

import { Err, Ok, axiosInstance } from '@nangohq/utils';

import type { ConnectWisePsaWebhookPayload, WebhookHandler } from './types.js';
import type { Result } from '@nangohq/utils';

interface SigningKeyResponse {
    signing_key: string;
}

/**
 * Validates that a URL is from a trusted ConnectWise subdomain.
 * SECURITY CRITICAL: This prevents attackers from directing us to fetch signing keys
 * from malicious servers that they control.
 *
 * @param keyUrl - The URL from the webhook's Metadata.key_url field (UNTRUSTED)
 * @param trustedSubdomain - The pre-configured trusted subdomain (e.g., "sandbox-na" or "api-na")
 * @returns The validated key URL or an error
 */
function trustedKeyUrl(keyUrl: string, trustedSubdomain: string): Result<string> {
    try {
        const keyUrlParsed = new URL(keyUrl);

        // Only accept HTTPS protocol
        if (keyUrlParsed.protocol !== 'https:') {
            return Err(new Error('webhook_invalid_key_url', { cause: 'Key URL must use HTTPS protocol' }));
        }

        // Construct the expected host from the trusted subdomain
        const expectedHost = `${trustedSubdomain}.myconnectwise.net`;

        // Verify the host matches exactly
        if (keyUrlParsed.host !== expectedHost) {
            return Err(new Error('webhook_invalid_key_url', { cause: 'Key URL host does not match trusted subdomain' }));
        }

        return Ok(keyUrl);
    } catch (err) {
        return Err(new Error('webhook_invalid_key_url', { cause: err }));
    }
}

/**
 * Fetches the signing key from ConnectWise key URL.
 * Only fetches from pre-validated trusted subdomains.
 *
 * @param keyUrl - The URL from the webhook's Metadata.key_url field (UNTRUSTED until validated)
 * @param trustedSubdomain - The pre-configured trusted subdomain (e.g., "sandbox-na")
 * @returns The signing key or an error
 */
async function fetchSigningKey(keyUrl: string, trustedSubdomain: string): Promise<Result<string>> {
    try {
        // Validate that the key URL is from a trusted subdomain BEFORE fetching
        const trusted = trustedKeyUrl(keyUrl, trustedSubdomain);
        if (trusted.isErr()) {
            return trusted;
        }

        const response = await axiosInstance.get<SigningKeyResponse>(keyUrl);
        if (!response.data?.signing_key) {
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
        const calculatedBuffer = Buffer.from(calculatedSignature);
        const headerBuffer = Buffer.from(headerSignature);

        if (calculatedBuffer.length !== headerBuffer.length) {
            return false;
        }

        return timingSafeEqual(calculatedBuffer, headerBuffer);
    } catch {
        return false;
    }
}

const route: WebhookHandler<ConnectWisePsaWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-content-signature'];

    if (!signature) {
        return Err(new Error('webhook_missing_signature', { cause: 'Missing signature header' }));
    }

    // Verify webhook signature using payload metadata key_url
    // The mandatory webhookSecret field contains the trusted subdomain (e.g., "sandbox-na" or "api-na").
    const trustedSubdomain = nango.integration.custom?.['webhookSecret'];
    const keyUrl = body.Metadata?.key_url;

    if (!trustedSubdomain || typeof trustedSubdomain !== 'string') {
        return Err(new Error('webhook_invalid_signature', { cause: 'Trusted subdomain is not configured in webhookSecret field' }));
    }

    if (typeof keyUrl !== 'string') {
        return Err(new Error('webhook_invalid_signature', { cause: 'Missing or invalid key_url in webhook metadata' }));
    }

    const signingKey = await fetchSigningKey(keyUrl, trustedSubdomain);

    if (signingKey.isErr()) {
        return Err(new Error('webhook_invalid_signature', { cause: signingKey.error }));
    }

    if (!validateSignature(signingKey.value, signature, rawBody)) {
        return Err(new Error('webhook_invalid_signature', { cause: 'Signature validation failed' }));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'Type' // ConnectWise webhook type field
    });

    const connectionId = response?.connectionIds?.[0];

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: connectionId ? [connectionId] : [],
        toForward: body
    });
};

export default route;

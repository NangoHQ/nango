import { createHash, createHmac, timingSafeEqual } from 'crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, axiosInstance, getLogger } from '@nangohq/utils';

import type { ConnectWisePsaWebhookPayload, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.ConnectWisePsa');

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
 * @returns true if the keyUrl matches the trusted subdomain under .myconnectwise.net
 */
function isTrustedKeyUrl(keyUrl: string, trustedSubdomain: string): boolean {
    try {
        const keyUrlParsed = new URL(keyUrl);

        // Only accept HTTPS protocol
        if (keyUrlParsed.protocol !== 'https:') {
            logger.error('Key URL must use HTTPS protocol', { keyUrl, protocol: keyUrlParsed.protocol });
            return false;
        }

        // Construct the expected host from the trusted subdomain
        const expectedHost = `${trustedSubdomain}.myconnectwise.net`;

        // Verify the host matches exactly
        if (keyUrlParsed.host !== expectedHost) {
            logger.error('Key URL does not match trusted ConnectWise subdomain', {
                keyUrl,
                keyUrlHost: keyUrlParsed.host,
                trustedSubdomain,
                expectedHost
            });
            return false;
        }

        return true;
    } catch (err) {
        logger.error('Error parsing key URL', { keyUrl, trustedSubdomain, error: err });
        return false;
    }
}

/**
 * Fetches the signing key from ConnectWise key URL.
 * SECURITY CRITICAL: Only fetches from pre-validated trusted subdomains.
 *
 * @param keyUrl - The URL from the webhook's Metadata.key_url field (UNTRUSTED until validated)
 * @param trustedSubdomain - The pre-configured trusted subdomain (e.g., "sandbox-na")
 * @returns The signing key if successfully fetched and validated, null otherwise
 */
async function fetchSigningKey(keyUrl: string, trustedSubdomain: string): Promise<string | null> {
    try {
        // SECURITY: Validate that the key URL is from a trusted subdomain BEFORE fetching
        if (!isTrustedKeyUrl(keyUrl, trustedSubdomain)) {
            return null;
        }

        // Fetch the signing key from the validated URL
        const response = await axiosInstance.get<SigningKeyResponse>(keyUrl);

        if (!response.data?.signing_key) {
            logger.error('Invalid signing key response - missing signing_key field', { keyUrl });
            return null;
        }

        return response.data.signing_key;
    } catch (err) {
        logger.error('Error fetching signing key from ConnectWise', { keyUrl, error: err });
        return null;
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
    } catch (err) {
        logger.error('Error validating ConnectWise signature', err);
        return false;
    }
}

const route: WebhookHandler<ConnectWisePsaWebhookPayload> = async (nango, headers, body, rawBody) => {
    // Extract ConnectWise webhook headers
    const signature = headers['x-content-signature'];

    // SECURITY: Verify webhook signature using dynamic key from ConnectWise
    // The webhookSecret field contains the trusted subdomain (e.g., "sandbox-na" or "api-na")
    const trustedSubdomain = nango.integration.custom?.['webhookSecret'];
    const keyUrl = body.Metadata?.key_url;

    // If trustedSubdomain is configured, signature validation is MANDATORY
    if (typeof trustedSubdomain === 'string') {
        // SECURITY: Once a trusted subdomain is configured, we MUST validate signatures
        // Do not proceed without full validation

        if (!signature) {
            logger.error('Missing x-content-signature header but trustedSubdomain is configured', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (typeof keyUrl !== 'string') {
            logger.error('Missing Metadata.key_url in webhook payload but trustedSubdomain is configured', {
                configId: nango.integration.id,
                hasMetadata: !!body.Metadata
            });
            return Err(new NangoError('webhook_invalid_signature'));
        }

        // SECURITY: Fetch the signing key ONLY from the pre-trusted ConnectWise subdomain
        const signingKey = await fetchSigningKey(keyUrl, trustedSubdomain);

        if (!signingKey) {
            logger.error('Failed to fetch signing key or key URL is not from trusted subdomain', {
                configId: nango.integration.id,
                keyUrl,
                trustedSubdomain
            });
            return Err(new NangoError('webhook_invalid_signature'));
        }

        // Validate the signature using the fetched key
        if (!validateSignature(signingKey, signature, rawBody)) {
            logger.error('Invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }

        logger.info('Webhook signature validated successfully', { configId: nango.integration.id });
    } else {
        // No trustedSubdomain configured - skip validation but log a warning
        logger.warn('Webhook signature validation skipped - no trustedSubdomain configured', {
            configId: nango.integration.id,
            message:
                'Configure the Webhook Secret field in integration settings with your trusted ConnectWise subdomain (e.g., "sandbox-na" or "api-na") to enable webhook signature validation'
        });
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'Type' // ConnectWise webhook type field
    });

    const connectionId = response?.connectionIds?.[0];

    if (!connectionId) {
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: body
        });
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: [connectionId],
        toForward: body
    });
};

export default route;

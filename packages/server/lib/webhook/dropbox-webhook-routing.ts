import crypto from 'crypto';
import { getLogger } from '@nangohq/utils';
import type { Config } from '@nangohq/shared';
import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const logger = getLogger('Webhook.Dropbox');

/**
 * Validates the Dropbox webhook signature
 * Dropbox uses HMAC-SHA256 with the app secret to sign the request body
 */
function validateSignature(integration: Config, headerSignature: string, rawBody: string): boolean {
    if (!integration.oauth_client_secret) {
        logger.error('Missing oauth_client_secret for signature validation', { configId: integration.id });
        return false;
    }

    // try {
    const signature = crypto.createHmac('sha256', integration.oauth_client_secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature));
    // } catch (err) {
    //     logger.error('Error validating signature', { configId: integration.id, err });
    //     return false;
    // }
}

/**
 * Dropbox webhook handler
 *
 * Handles two types of requests:
 * 1. Verification requests (GET) - Responds to Dropbox's challenge request
 * 2. Notification requests (POST) - Routes notifications to appropriate connections
 *
 * Docs: https://www.dropbox.com/developers/reference/webhooks
 */
const route: WebhookHandler = async (nango, integration, headers, body, rawBody, logContextGetter: LogContextGetter) => {
    // Handle verification request (GET)
    // logger.info('Received verification request', { configId: integration.id });
    // console.log(body);

    // logger.info('Received verification request', { configId: integration.id });
    // return { acknowledgementResponse: body['challenge'] };

    // Handle notification request (POST)
    logger.info('Received webhook notification', { configId: integration.id });

    // Verify signature if provided
    const signature = headers['x-dropbox-signature'];
    if (!signature) {
        logger.error('Missing X-Dropbox-Signature header', { configId: integration.id });
        return { connectionIds: [] };
    }

    // Validate the webhook signature
    if (!validateSignature(integration, signature, rawBody)) {
        logger.error('Invalid signature', { configId: integration.id });
        return { connectionIds: [] };
    }

    // try {
    // The payload contains a list of account IDs that have changes
    // Format: { "list_folder": { "accounts": ["dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc", ...] }, ... }
    const accounts = body.list_folder?.accounts || [];

    if (!accounts.length) {
        logger.info('No accounts in Dropbox webhook notification', { configId: integration.id });
        return { connectionIds: [] };
    }

    logger.info(`Processing ${accounts.length} accounts`, { configId: integration.id });

    // TODO: Remove loop if only one is returned: for now Process each account ID in the notification
    const allConnectionIds = [];
    for (const accountId of accounts) {
        const response = await nango.executeScriptForWebhooks(
            integration,
            { accountId },
            'type', // Webhook type
            'accountId',
            logContextGetter,
            'account_id' // Field name in the connection config
        );

        if (response?.connectionIds?.length) {
            logger.info(`Found ${response.connectionIds.length} connections for account ${accountId}`, { configId: integration.id, accountId });
            allConnectionIds.push(...response.connectionIds);
        } else {
            logger.info(`No connections found for account ${accountId}`, { configId: integration.id, accountId });
        }
    }

    return {
        parsedBody: {
            ...body,
            type: 'file_change'
        },
        connectionIds: allConnectionIds
    };
    // } catch (err) {
    //     logger.error('Error processing Dropbox webhook', { configId: integration.id, err });
    //     return { connectionIds: [] };
    // }
};

export default route;

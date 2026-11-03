import crypto from 'node:crypto';

import { getFlags } from '@nangohq/feature-flags';
import { connectionService, NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import type { InternalNango } from './internal-nango.js';
import type { WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.GithubApp');

function signatureMatches(secret: string, headerSignature: string, rawBody: string): boolean {
    const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return trusted.length === untrusted.length && crypto.timingSafeEqual(trusted, untrusted);
}

/**
 * The integration has an app: the webhook secret is derived from its credentials.
 */
function validateIntegration(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    const decodedSecret = Buffer.from(integration.oauth_client_secret!, 'base64').toString('ascii');
    const secret = crypto.createHash('sha256').update(`${integration.oauth_client_id}${decodedSecret}${integration.app_link}`).digest('hex');

    return signatureMatches(secret, headerSignature, rawBody);
}

/**
 * The integration has no app: each connection brought its own app and the webhook secret the end user set on it.
 * The app id header only picks the candidate connections, the signature still has to match their secret.
 */
async function validateConnections(nango: InternalNango, headers: Record<string, string>, headerSignature: string, rawBody: string): Promise<boolean> {
    const appId = headers['x-github-hook-installation-target-id'];
    if (!appId) {
        return false;
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues({ app_id: appId }, nango.environment.id);
    return Boolean(
        connections?.some(
            (connection) =>
                connection.provider_config_key === nango.integration.unique_key &&
                connection.credentials.type === 'APP' &&
                connection.credentials.config_override &&
                signatureMatches(connection.credentials.config_override.webhook_secret, headerSignature, rawBody)
        )
    );
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const signature = headers?.['x-hub-signature-256'];

    if (signature) {
        const valid = nango.integration.oauth_client_secret
            ? validateIntegration(nango.integration, signature, rawBody)
            : await validateConnections(nango, headers, signature, rawBody);

        if (!valid) {
            logger.error('Github App webhook signature invalid');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        const outcome = await nango.unverifiedOutcome((accountUuid) => getFlags().allowUnauthorizedGithubAppWebhook(accountUuid));
        nango.markUnverified({ reason: 'github_app_missing_signature', remediation: 'Set the Nango webhook secret on the GitHub App' }, outcome);

        if (outcome === 'rejected') {
            logger.error('Github App webhook signature missing', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookHeaderValue: headers['x-github-event'] as string,
        connectionIdentifier: 'installation.id',
        propName: 'installation_id'
    });
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;

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

function validateIntegrationLevelSignature(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.oauth_client_secret) {
        return false;
    }

    const decodedSecret = Buffer.from(integration.oauth_client_secret, 'base64').toString('ascii');

    const hash = `${integration.oauth_client_id}${decodedSecret}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    return signatureMatches(secret, headerSignature, rawBody);
}

/**
 * Integration without an app: the webhook is signed with the `webhook_secret` stored in the connection.
 * Connections are matched on the app id header and the payload's installation id, so an app owner can only
 * sign payloads for its own installation.
 */
async function validateConnectionLevelSignature(
    nango: InternalNango,
    headers: Record<string, string>,
    headerSignature: string,
    rawBody: string,
    body: { installation?: { id?: number | string } } | null
) {
    const appId = headers['x-github-hook-installation-target-id'];
    const installationId = body?.installation?.id;
    if (!appId || installationId === undefined || installationId === null) {
        return false;
    }

    const connections = await connectionService.findConnectionsByConnectionConfigValue(
        'installation_id',
        String(installationId),
        nango.environment.id,
        nango.integration.id
    );

    return (connections ?? []).some((connection) => {
        if (connection.credentials.type !== 'APP' || connection.connection_config['app_id'] !== appId) {
            return false;
        }

        const secret = connection.credentials.config_override?.webhook_secret;
        return secret ? signatureMatches(secret, headerSignature, rawBody) : false;
    });
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const signature = headers?.['x-hub-signature-256'];

    if (signature) {
        const valid =
            !nango.integration.oauth_client_secret && (await getFlags().isGithubAppConnectionCredentialsEnabled())
                ? await validateConnectionLevelSignature(nango, headers, signature, rawBody, body)
                : validateIntegrationLevelSignature(nango.integration, signature, rawBody);

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

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Slack');

// Slack rejects anything older than five minutes, and so do we.
// https://docs.slack.dev/authentication/verifying-requests-from-slack
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const SIGNATURE_VERSION = 'v0';

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.custom?.['webhookSecret'];

    // Verified before the url_verification handshake, before dispatch and before forwarding, so a
    // forged event cannot answer the endpoint challenge or reach the customer as a Nango webhook.
    if (secret) {
        const signature = headers['x-slack-signature'];
        const timestamp = headers['x-slack-request-timestamp'];

        if (!signature || !timestamp) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (typeof rawBody !== 'string' || rawBody.length === 0) {
            logger.error('missing raw body for signature validation', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }

        if (!isFreshTimestamp(timestamp, SIGNATURE_TOLERANCE_SECONDS)) {
            logger.error('stale signature timestamp', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }

        const signed = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;

        if (!validateHmacSignature({ secret, rawBody, payload: signed, signature, prefix: `${SIGNATURE_VERSION}=` })) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'slack_missing_signing_secret', remediation: 'Set the Slack signing secret on the integration' });
    }

    // slack sometimes sends the payload as a form encoded string, so we need to parse it
    // it also sends json as a x-www-form-urlencoded string, so we need to handle that too
    let payload;
    if (headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
        try {
            payload = JSON.parse(body['payload'] || body);
        } catch {
            payload = body;
        }
    } else {
        payload = body;
    }

    if (payload['type'] === 'url_verification') {
        return Ok({ content: body['challenge'], statusCode: 200 });
    } else {
        // the team.id is sometimes stored in the team_id field, and sometimes in the team.id field
        // so we need to check both
        const teamId = payload['team_id'] || payload['team']?.['id'];
        const response = await nango.executeScriptForWebhooks({
            payload: { ...payload, teamId },
            webhookType: 'type',
            connectionIdentifier: 'teamId',
            propName: 'team.id'
        });

        // slack requires an empty 200 body for view_submission; a non-empty body
        // https://docs.slack.dev/surfaces/modals/#close_current_view
        if (payload['type'] === 'view_submission') {
            return Ok({
                content: null,
                statusCode: 200,
                connectionIds: response?.connectionIds || [],
                toForward: payload
            });
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: payload
        });
    }
};

export default route;

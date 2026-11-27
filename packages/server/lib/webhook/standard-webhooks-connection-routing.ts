import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type {
    ClerkWebhookPayload,
    IncidentIoWebhookPayload,
    OpenAIWebhookPayload,
    PostHogWebhookPayload,
    ResendWebhookPayload,
    WebhookHandler
} from './types.js';

// Standard Webhooks names its headers `webhook-*`; Svix-hosted senders use `svix-*`.
const hasHeader = (headers: Record<string, string>, name: 'id' | 'timestamp' | 'signature') => Boolean(headers[`webhook-${name}`] || headers[`svix-${name}`]);

/**
 * For providers that sign with Standard Webhooks (Svix) from an endpoint each end user creates in the
 * provider's dashboard, with a signing secret of its own. A delivery can only be verified with its
 * endpoint's secret, so each webhook URL carries `?nangoConnectionId=` and the delivery is verified
 * against the `webhookSecret` stored on that connection.
 *
 * `webhookType` is the payload field holding the event type, when the provider sends one.
 */
function standardWebhooksConnectionRouting<T extends object>(webhookType?: string): WebhookHandler<T> {
    return async (nango, headers, body, rawBody, query) => {
        const nangoConnectionId = query?.['nangoConnectionId'];
        if (!nangoConnectionId) {
            return Err(new NangoError('webhook_missing_connection_id'));
        }

        // Checked before the connection is looked up, so the answer never depends on the connection.
        if (!hasHeader(headers, 'id') || !hasHeader(headers, 'timestamp') || !hasHeader(headers, 'signature')) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        // An unknown connection, one without a secret and a wrong signature all return the same error, so the
        // endpoint can't be used to check which connection ids exist.
        const connection = await nango.getConnectionForWebhook(nangoConnectionId);
        // TODO: NAN-6927 move off metadata
        const secret = connection?.metadata?.['webhookSecret'];
        if (typeof secret !== 'string' || !secret) {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        // The default window, 5 minutes either way, is the one the Standard Webhooks reference libraries and
        // OpenAI's SDK use. It doesn't drop retries: the spec has the sender sign every attempt again with the
        // attempt's own `webhook-timestamp`, keeping only `webhook-id`, so the window covers clock skew and time in
        // transit, not the retry schedule. PostHog signs each attempt just before sending it, and a real OpenAI
        // retry, a minute after a failed delivery, kept its `webhook-id` and came with a new timestamp.
        // https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
        if (validateSvixSignature({ secret, headers, rawBody }) !== 'valid') {
            return Err(new NangoError('webhook_invalid_signature'));
        }

        const response = await nango.executeScriptForWebhooks({
            payload: body as Record<string, unknown>,
            ...(webhookType ? { webhookType } : {}),
            connectionIdentifierValue: nangoConnectionId,
            propName: 'connectionId'
        });

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    };
}

export const incidentIoWebhookRouting = standardWebhooksConnectionRouting<IncidentIoWebhookPayload>('event_type');
export const clerkWebhookRouting = standardWebhooksConnectionRouting<ClerkWebhookPayload>('type');
export const resendWebhookRouting = standardWebhooksConnectionRouting<ResendWebhookPayload>('type');
export const openaiWebhookRouting = standardWebhooksConnectionRouting<OpenAIWebhookPayload>('type');
export const postHogWebhookRouting = standardWebhooksConnectionRouting<PostHogWebhookPayload>('event.event');

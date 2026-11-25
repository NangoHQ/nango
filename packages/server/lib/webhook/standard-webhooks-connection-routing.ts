import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateSvixSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/** https://docs.incident.io/api-reference/webhooks */
export interface IncidentIoWebhookPayload {
    event_type: string;
    [key: string]: unknown;
}

/** https://clerk.com/docs/webhooks/overview */
export interface ClerkWebhookPayload {
    type: string;
    object: 'event';
    data: Record<string, unknown>;
    timestamp: number;
    instance_id: string;
}

/** https://resend.com/docs/dashboard/webhooks/introduction */
export interface ResendWebhookPayload {
    type: string;
    created_at: string;
    data: Record<string, unknown>;
}

/** https://platform.openai.com/docs/guides/webhooks */
export interface OpenAIWebhookPayload {
    id: string;
    object: 'event';
    type: string;
    created_at: number;
    data: Record<string, unknown>;
}

/**
 * The body of a PostHog webhook destination is a template the user can edit. The default one sends the
 * captured event, whose name is `event.event`, for example `$pageview`.
 * https://posthog.com/docs/data-pipelines/destinations/webhook
 */
export interface PostHogWebhookPayload {
    event?: { uuid?: string; event?: string; distinct_id?: string; properties?: Record<string, unknown>; timestamp?: string; url?: string };
    person?: Record<string, unknown>;
    [key: string]: unknown;
}

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

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isFreshTimestamp, validateHmacSignature } from './signature.js';

import type { WebhookHandler } from './types.js';

/** https://elevenlabs.io/docs/eleven-api/resources/webhooks */
export interface ElevenLabsWebhookPayload {
    type:
        | 'post_call_transcription'
        | 'post_call_audio'
        | 'call_initiation_failure'
        | 'voice_removal_notice'
        | 'voice_removal_notice_withdrawn'
        | 'voice_removed'
        | 'flows_generation'
        | 'flows_template_run'
        | (string & {});
    event_timestamp: number;
    data: Record<string, unknown>;
}

const SIGNATURE_HEADER = 'elevenlabs-signature';
// ElevenLabs' own SDK accepts deliveries signed up to 30 minutes ago.
const TOLERANCE_SECONDS = 30 * 60;

// ElevenLabs sends `t=<unix seconds>,v0=<hex>` in `elevenlabs-signature`, where the hex is HMAC-SHA256 of
// `{timestamp}.{rawBody}` keyed by the webhook's secret.
// https://elevenlabs.io/docs/product-guides/administration/webhooks
// The payload carries no workspace identifier, so each webhook is registered with `?nangoConnectionId=` and
// verified against the secret stored on that connection.
const route: WebhookHandler<ElevenLabsWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    const nangoConnectionId = query?.['nangoConnectionId'];
    if (!nangoConnectionId) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const { timestamp, signatures } = parseSignatureHeader(headers[SIGNATURE_HEADER]);
    if (!timestamp || signatures.length === 0) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    // An unknown connection, one without a secret, a stale timestamp and a wrong signature all return the same
    // error, so the endpoint can't be used to check which connection ids exist.
    const connection = await nango.getConnectionForWebhook(nangoConnectionId);
    // TODO: NAN-6927 move off metadata
    const secret = connection?.metadata?.['webhookSecret'];
    if (
        typeof secret !== 'string' ||
        !secret ||
        !isFreshTimestamp(timestamp, TOLERANCE_SECONDS) ||
        !signatures.some((signature) => validateHmacSignature({ secret, rawBody, payload: `${timestamp}.${rawBody}`, signature }))
    ) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
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

function parseSignatureHeader(header: string | undefined): { timestamp: string | undefined; signatures: string[] } {
    let timestamp: string | undefined;
    const signatures: string[] = [];
    for (const part of (header ?? '').split(',')) {
        const [key, value] = part.trim().split('=', 2);
        if (key === 't' && value) {
            timestamp = value;
        } else if (key === 'v0' && value) {
            signatures.push(value);
        }
    }
    return { timestamp, signatures };
}

export default route;

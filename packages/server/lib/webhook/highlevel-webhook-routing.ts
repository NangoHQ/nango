import crypto from 'node:crypto';

import { NangoError, formatPem } from '@nangohq/shared';
import { Err, Ok, getLogger, report } from '@nangohq/utils';

import type { HighLevelWebhookResponse, WebhookHandler } from './types.js';

const logger = getLogger('Webhook.Highlevel');

function validate(headerSignature: string, publicKey: string, rawBody: string): boolean {
    try {
        const verifier = crypto.createVerify('SHA256');
        verifier.update(rawBody, 'utf8');
        verifier.end();

        return verifier.verify(publicKey, headerSignature.trim(), 'base64');
    } catch (err) {
        report(new Error('Validation error', { cause: err }));
        return false;
    }
}

const route: WebhookHandler<HighLevelWebhookResponse> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-wh-signature'];
    if (nango.integration.custom?.['webhookSecret']) {
        if (!signature) {
            logger.error('missing signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validate(signature, formatPem(nango.integration.custom['webhookSecret'], 'PUBLIC KEY'), rawBody)) {
            logger.error('invalid signature', { configId: nango.integration.id });
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        logger.info('no webhook secret configured, skipping signature validation', { configId: nango.integration.id });
    }

    const { companyId, locationId, altId, altType, type } = body;

    const resolvedLocationId = locationId ?? (altType === 'location' ? altId : undefined);

    const connectionIdentifier = resolvedLocationId ? 'locationId' : companyId ? 'companyId' : '';

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: type ?? '',
        connectionIdentifier,
        ...(connectionIdentifier && { propName: connectionIdentifier })
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;

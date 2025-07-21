import crypto from 'node:crypto';

import axios from 'axios';

import { NangoError, environmentService, getGlobalWebhookReceiveUrl } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';

const logger = getLogger('Webhook.Gmail');

interface DecodedDataObject {
    emailAddress: string;
    historyId: string;
}

export async function validate(integration: ProviderConfig, headers: Record<string, any>): Promise<boolean> {
    try {
        const authHeader: string | undefined = headers['authorization'];

        if (!authHeader) {
            return true;
        }

        if (!authHeader?.startsWith('Bearer ')) {
            return false;
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            logger.warning('No JWT token found in Authorization header');
            return false;
        }

        const [headerB64, payloadB64, signatureB64] = token.split('.');
        if (!headerB64 || !payloadB64 || !signatureB64) {
            return false;
        }

        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        const signedData = `${headerB64}.${payloadB64}`;
        const signature = Buffer.from(signatureB64, 'base64url');

        const { data: jwks } = await axios.get('https://www.googleapis.com/oauth2/v3/certs');
        const jwk = jwks.keys.find((key: any) => key.kid === header.kid);
        if (!jwk) {
            throw new Error(`No matching JWK found for kid: ${header.kid}`);
        }

        const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });

        const isVerified = crypto.verify('RSA-SHA256', Buffer.from(signedData), pubKey, signature);

        if (!isVerified) {
            logger.warning('JWT signature verification failed');
            return false;
        }

        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== 'https://accounts.google.com') {
            logger.warning(`Unexpected JWT issuer: ${payload.iss}`);
            return false;
        }

        const environment = await environmentService.getRawById(integration.environment_id);
        const webhookUrl = `${getGlobalWebhookReceiveUrl()}/${environment?.uuid}/${integration.provider}`;

        if (payload.aud !== webhookUrl) {
            logger.warning(`Invalid audience. Expected ${webhookUrl}, got ${payload.aud}`);
            return false;
        }

        if (payload.exp < now) {
            logger.error('webhook signature invalid');
            return false;
        }

        return true;
    } catch (err: any) {
        logger.error('Validation error:', err.message);
        return false;
    }
}

const route: WebhookHandler = async (nango, integration, headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const authHeader = headers['authorization'];

    if (authHeader) {
        const valid = await validate(integration, headers);

        if (!valid) {
            logger.error('webhook signature invalid');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    let decodedBody: DecodedDataObject | null = null;

    const encodedBody = typeof body.data === 'string' ? Buffer.from(body.data, 'base64').toString('utf8') : body;
    try {
        decodedBody = JSON.parse(encodedBody);
    } catch (err) {
        logger.error('Failed to parse webhook body:', err);
        return Err(new NangoError('webhook_invalid_body'));
    }
    const editedBodyWithCatchAll = { ...body, type: '*', emailAddress: decodedBody?.emailAddress };

    const response = await nango.executeScriptForWebhooks(
        integration,
        editedBodyWithCatchAll,
        'type',
        'emailAddress',
        logContextGetter,
        'metadata.emailAddress'
    );

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;

import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const getOrigin = (url: string): string | null => {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

const getHeader = (
    headers: Record<string, string>,
    headerName: string
): string | undefined => {
    const lowerName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerName) {
            return value;
        }
    }
    return undefined;
};

const validateJiraSignature = (
    secret: string,
    headerSignature: string,
    rawBody: string
): boolean => {
    const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
    const trusted = Buffer.from(expectedSignature, 'utf8');
    const untrusted = Buffer.from(headerSignature, 'utf8');

    return (
        trusted.length === untrusted.length &&
        crypto.timingSafeEqual(trusted, untrusted)
    );
};

const MAX_SELF_LINK_SCAN_NODES = 1_000;

const extractBaseUrlFromSelfLink = (value: unknown): string | null => {
    const stack: unknown[] = [value];
    const seen = new Set<object>();
    let scannedNodes = 0;

    while (stack.length > 0 && scannedNodes < MAX_SELF_LINK_SCAN_NODES) {
        const current = stack.pop();
        scannedNodes += 1;

        if (Array.isArray(current)) {
            if (seen.has(current)) {
                continue;
            }

            seen.add(current);
            for (let index = current.length - 1; index >= 0; index--) {
                stack.push(current[index]);
            }

            continue;
        }

        if (!isRecord(current) || seen.has(current)) {
            continue;
        }

        seen.add(current);
        if (typeof current['self'] === 'string') {
            const baseUrl = getOrigin(current['self']);
            if (baseUrl) {
                return baseUrl;
            }
        }

        const values = Object.values(current);
        for (let index = values.length - 1; index >= 0; index--) {
            stack.push(values[index]);
        }
    }

    return null;
};

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const webhookSecret = nango.integration.custom?.['webhookSecret'];
    if (webhookSecret) {
        const signature = getHeader(headers, 'x-hub-signature');
        if (!signature) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!validateJiraSignature(webhookSecret, signature, rawBody)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const baseUrl = extractBaseUrlFromSelfLink(event);
            if (!baseUrl) {
                continue;
            }

            const response = await nango.executeScriptForWebhooks({
                body: event,
                webhookType: 'webhookEvent',
                connectionIdentifierValue: baseUrl,
                propName: 'baseUrl'
            });
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds
        });
    } else {
        const baseUrl = extractBaseUrlFromSelfLink(body);
        if (!baseUrl) {
            return Ok({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [],
                toForward: body
            });
        }

        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'webhookEvent',
            connectionIdentifierValue: baseUrl,
            propName: 'baseUrl'
        });
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }
};

export default route;

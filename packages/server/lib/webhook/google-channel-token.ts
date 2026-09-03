import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

function safeCompare(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Google push notifications have no HMAC. Authenticity is the `token` set at
 * watch registration and echoed as `X-Goog-Channel-Token`.
 * Verification runs only when the integration has a webhook secret.
 */
export function validateGoogleChannelToken(integration: IntegrationConfig, headers: Record<string, any>): Result<void> {
    const expected = integration.custom?.['webhookSecret'];
    if (!expected || typeof expected !== 'string') {
        return Ok(undefined);
    }

    const received = headers['x-goog-channel-token'];
    if (!received || typeof received !== 'string') {
        return Err(new NangoError('webhook_missing_token'));
    }

    if (!safeCompare(expected, received)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    return Ok(undefined);
}

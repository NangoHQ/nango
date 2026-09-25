import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { getFlags } from '@nangohq/feature-flags';
import { NangoError } from '@nangohq/shared';
import { Err, Ok, report } from '@nangohq/utils';

import { getBotFrameworkJWK } from './cache.js';

import type { UnverifiedWebhook } from './missing-secret.js';
import type { WebhookHandler } from './types.js';

const BOT_FRAMEWORK_ISSUER = 'https://api.botframework.com';
const CLOCK_TOLERANCE_SECONDS = 5 * 60;

const UNVERIFIED = {
    missingAuthorization: {
        reason: 'microsoft_teams_missing_authorization',
        remediation: 'Send activities to this URL through the Bot Framework connector'
    },
    invalidToken: {
        reason: 'microsoft_teams_invalid_token',
        remediation: 'Send activities to this URL through the Bot Framework connector'
    },
    unexpectedIssuer: {
        reason: 'microsoft_teams_unexpected_issuer',
        remediation: 'Send activities to this URL through the Bot Framework connector'
    },
    audienceMismatch: {
        reason: 'microsoft_teams_audience_mismatch',
        remediation: "Set the integration's client ID to the bot's Microsoft App ID"
    }
} satisfies Record<string, UnverifiedWebhook>;

interface BotFrameworkActivity {
    channelId?: unknown;
    serviceUrl?: unknown;
}

/**
 * Validates the Bot Framework token the connector sends with every activity.
 * Returns why the activity is unverified, or null when the token is valid.
 * https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication#connector-to-bot
 */
export async function verifyBotFrameworkToken({
    authorization,
    appId,
    activity
}: {
    authorization: string | undefined;
    appId: string | null | undefined;
    activity: BotFrameworkActivity | null | undefined;
}): Promise<UnverifiedWebhook | null> {
    if (!authorization) {
        return UNVERIFIED.missingAuthorization;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return UNVERIFIED.invalidToken;
    }

    try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded?.header.kid || typeof decoded.payload === 'string') {
            return UNVERIFIED.invalidToken;
        }

        // Only labels the metric, the token is still rejected. Separates Entra issued tokens, which
        // Bot Framework does not send to channel bots today, from forged ones.
        if (decoded.payload.iss !== BOT_FRAMEWORK_ISSUER) {
            return UNVERIFIED.unexpectedIssuer;
        }

        const jwk = await getBotFrameworkJWK(decoded.header.kid);
        if (!jwk) {
            return UNVERIFIED.invalidToken;
        }

        const channelId = activity?.channelId;
        if (jwk.endorsements && (typeof channelId !== 'string' || !jwk.endorsements.includes(channelId))) {
            return UNVERIFIED.invalidToken;
        }

        const publicKey = crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
        const payload = jwt.verify(token, publicKey, {
            algorithms: ['RS256'],
            issuer: BOT_FRAMEWORK_ISSUER,
            clockTolerance: CLOCK_TOLERANCE_SECONDS
        });
        if (typeof payload === 'string') {
            return UNVERIFIED.invalidToken;
        }

        if (typeof activity?.serviceUrl !== 'string' || payload['serviceurl'] !== activity.serviceUrl) {
            return UNVERIFIED.invalidToken;
        }

        if (!appId || ![payload.aud].flat().includes(appId)) {
            return UNVERIFIED.audienceMismatch;
        }

        return null;
    } catch (err) {
        if (!(err instanceof jwt.JsonWebTokenError)) {
            report(new Error('Bot Framework token validation error', { cause: err }));
        }
        return UNVERIFIED.invalidToken;
    }
}

const route: WebhookHandler<Record<string, unknown>> = async (nango, headers, body) => {
    const unverified = await verifyBotFrameworkToken({
        authorization: headers['authorization'],
        appId: nango.integration.oauth_client_id,
        activity: body
    });

    if (unverified) {
        nango.markUnverified(unverified);

        if (await getFlags().isMicrosoftTeamsWebhookVerificationEnforced(nango.team.uuid)) {
            return Err(new NangoError(unverified === UNVERIFIED.missingAuthorization ? 'webhook_missing_signature' : 'webhook_invalid_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        payload: body,
        webhookType: 'type',
        connectionIdentifier: 'channelData.tenant.id',
        propName: 'tenantId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;

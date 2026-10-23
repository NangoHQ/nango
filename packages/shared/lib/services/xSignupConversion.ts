import crypto from 'node:crypto';

import OAuth from 'oauth-1.0a';
import * as z from 'zod';

const iso = z.iso.datetime({ offset: true }).max(40);
const envelope = z
    .object({
        event: z.literal('auth:account_create'),
        timestamp: iso,
        companyId: z.string().regex(/^[1-9][0-9]*$/),
        distinctId: z.string(),
        surface: z.literal('server'),
        host: z.literal('https://api.nango.dev'),
        isSignupCreatorInternal: z.literal(false),
        consentMethod: z.enum(['explicit', 'implied']),
        consentTimestamp: iso,
        clickId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/),
        clickTimestamp: iso,
        isTestFixture: z.boolean().optional(),
        utmCampaign: z.string().max(512).optional()
    })
    .strict();
export type XSignupEnvelope = z.infer<typeof envelope>;
export interface XSignupCredentials {
    consumerKey: string;
    consumerSecret: string;
    accessToken: string;
    accessTokenSecret: string;
    pixelId: string;
    eventId: string;
}
export type XSignupDelivery = { outcome: 'accepted' | 'rejected' | 'retry'; reason: string };

/** Authenticated server-event assertions, not independently verified CMP evidence. */
export function parseXSignupEnvelope(raw: unknown, startAt: string, now = Date.now()): XSignupEnvelope | undefined {
    const result = envelope.safeParse(raw);
    if (!result.success) return;
    const c = result.data;
    const event = Date.parse(c.timestamp),
        consent = Date.parse(c.consentTimestamp),
        click = Date.parse(c.clickTimestamp),
        start = Date.parse(startAt);
    const companyId = Number(c.companyId);
    if (!Number.isSafeInteger(companyId) || c.distinctId !== `account-${c.companyId}` || !Number.isFinite(start)) return;
    if (
        event < start ||
        event > now ||
        now - event >= 86_400_000 ||
        consent > event ||
        click > consent ||
        event - consent >= 86_400_000 ||
        event - click >= 86_400_000
    )
        return;
    if (c.isTestFixture || c.utmCampaign?.startsWith('om_') || /^(om_|synthetic_)/.test(c.clickId)) return;
    return c;
}

export function xSignupPayload(c: XSignupEnvelope, eventId: string) {
    return {
        conversions: [
            { conversion_time: c.timestamp, event_id: eventId, identifiers: [{ twclid: c.clickId }], conversion_id: `nango:account_create:${c.companyId}` }
        ]
    };
}

async function boundedJson(response: Response): Promise<unknown> {
    if (!response.body) return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 8192) return;
            chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally {
        await reader.cancel().catch(() => undefined);
    }
}

/** Exactly one bounded attempt. PostHog owns retries; never throw an HTTP/OAuth object to logging middleware. */
export async function deliverXSignup(c: XSignupEnvelope, config: XSignupCredentials, request: typeof fetch = fetch): Promise<XSignupDelivery> {
    if (
        !/^[a-z0-9]{1,32}$/.test(config.pixelId) ||
        !/^[a-z0-9]{1,32}$/.test(config.eventId) ||
        !config.consumerKey ||
        !config.consumerSecret ||
        !config.accessToken ||
        !config.accessTokenSecret
    ) {
        return { outcome: 'rejected', reason: 'configuration' };
    }
    const url = `https://ads-api.x.com/12/measurement/conversions/${config.pixelId}`;
    try {
        const oauth = new OAuth({
            consumer: { key: config.consumerKey, secret: config.consumerSecret },
            signature_method: 'HMAC-SHA1',
            hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64')
        });
        const authorization = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, { key: config.accessToken, secret: config.accessTokenSecret }));
        const response = await request(url, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
            headers: { ...authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify(xSignupPayload(c, config.eventId))
        });
        if (response.status !== 200) {
            await response.body?.cancel().catch(() => undefined);
            return { outcome: response.status === 429 || response.status >= 500 ? 'retry' : 'rejected', reason: 'http_status' };
        }
        const receipt = z
            .object({ data: z.object({ conversions_processed: z.literal(1) }), errors: z.array(z.unknown()).max(0).optional() })
            .safeParse(await boundedJson(response));
        return receipt.success ? { outcome: 'accepted', reason: 'receipt' } : { outcome: 'retry', reason: 'invalid_receipt' };
    } catch {
        // Includes timeout, redirect, malformed response and signing failures; no raw message or body escapes.
        return { outcome: 'retry', reason: 'transport_or_response' };
    }
}

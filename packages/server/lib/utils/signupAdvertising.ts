import * as z from 'zod';

import { isInternalAccount } from '@nangohq/shared';

import { envs } from '../env.js';

import type { SignupAdvertising } from '@nangohq/types';
import type { Request } from 'express';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const choice = z
    .object({
        version: z.union([z.literal(1), z.literal(2)]),
        marketing: z.literal(true),
        gpc: z.literal(false),
        method: z.enum(['explicit', 'implied']),
        gdpr: z.boolean().nullable(),
        lgpd: z.boolean().nullable(),
        ccpa: z.boolean().nullable(),
        observedAt: z.number().int().positive(),
        // Optional click payloads are validated independently below. Future fields must not drop other networks.
        fbclid: z.unknown().optional(),
        fbclidAt: z.unknown().optional(),
        oppref: z.unknown().optional(),
        opprefAt: z.unknown().optional(),
        google: z.unknown().optional()
    })
    .strip();
const googleClick = z
    .object({ clickType: z.enum(['gclid', 'gbraid', 'wbraid']), clickId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/), clickAt: z.number().int().positive() })
    .strict();

/** Browser-reported choice, not verified CMP evidence. Invalid optional data never blocks signup. */
export function parseSignupAdvertising(raw: unknown, now = Date.now(), payloadVersion: 1 | 2 = 1): SignupAdvertising | undefined {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    try {
        const parsed = choice.safeParse(JSON.parse(raw));
        if (!parsed.success) return;
        const c = parsed.data;
        if (c.method === 'implied' && !(c.gdpr === false && c.lgpd === false && typeof c.ccpa === 'boolean')) return;
        if (c.observedAt > now || now - c.observedAt >= MAX_AGE_MS) return;
        const fresh = (at: unknown): at is number =>
            typeof at === 'number' && Number.isSafeInteger(at) && at > 0 && at <= c.observedAt && now - at < MAX_AGE_MS;
        const result: SignupAdvertising = {
            advertising_consent_method: c.method,
            advertising_consent_timestamp: new Date(c.observedAt).toISOString()
        };
        if (typeof c.fbclid === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(c.fbclid) && fresh(c.fbclidAt))
            result.advertising_fbc = `fb.1.${c.fbclidAt}.${c.fbclid}`;
        if (typeof c.oppref === 'string' && /^[\x21-\x7e]{1,512}$/.test(c.oppref) && fresh(c.opprefAt)) {
            result.advertising_oppref = c.oppref;
            result.advertising_oppref_click_timestamp = new Date(c.opprefAt).toISOString();
        }
        if (c.version === 2 && payloadVersion === 2) {
            const click = googleClick.safeParse(c.google);
            if (click.success && fresh(click.data.clickAt)) {
                result.advertising_google_click_type = click.data.clickType;
                result.advertising_google_click_id = click.data.clickId;
                result.advertising_google_click_timestamp = new Date(click.data.clickAt).toISOString();
                // Cookiebot's marketing category maps both purposes. Consent was checked once above.
                result.advertising_google_ad_user_data = 'granted';
                result.advertising_google_ad_personalization = 'granted';
            }
        }
        return result.advertising_fbc || result.advertising_oppref || result.advertising_google_click_id ? result : undefined;
    } catch {
        return;
    }
}

export function signupAdvertisingFromRequest(req: Pick<Request, 'cookies' | 'headers'>, email: string): SignupAdvertising | undefined {
    const isSignupCreatorInternal = isInternalAccount([{ email }]);
    if (!envs.SIGNUP_AD_CONTEXT_ENABLED || !envs.SIGNUP_AD_CONTEXT_COOKIE_NAME || req.headers['sec-gpc'] === '1' || isSignupCreatorInternal) return;
    const advertising = parseSignupAdvertising(req.cookies?.[envs.SIGNUP_AD_CONTEXT_COOKIE_NAME], Date.now(), envs.SIGNUP_AD_CONTEXT_VERSION);
    // The creator is known here before the account event, unlike the later async company update.
    return advertising
        ? { ...advertising, ...(advertising.advertising_google_click_id ? { is_signup_creator_internal: isSignupCreatorInternal } : {}) }
        : undefined;
}

import * as z from 'zod';

import { isInternalAccount } from '@nangohq/shared';

import { envs } from '../env.js';
import { parseSignupGoogleAdvertising } from './signupGoogleAdvertising.js';

import type { SignupAdvertising } from '@nangohq/types';
import type { Request } from 'express';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const choice = z
    .object({
        version: z.literal(1),
        marketing: z.literal(true),
        gpc: z.literal(false),
        method: z.enum(['explicit', 'implied']),
        gdpr: z.boolean().nullable(),
        lgpd: z.boolean().nullable(),
        ccpa: z.boolean().nullable(),
        observedAt: z.number().int().positive(),
        fbclidAt: z.number().int().positive().optional(),
        opprefAt: z.number().int().positive().optional(),
        fbclid: z
            .string()
            .min(1)
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/)
            .optional(),
        oppref: z
            .string()
            .min(1)
            .max(512)
            .regex(/^[\x21-\x7e]+$/)
            .optional()
    })
    .strict();

/** Browser-reported choice, not verified CMP evidence. Invalid optional data never blocks signup. */
export function parseSignupAdvertising(raw: unknown, now = Date.now()): SignupAdvertising | undefined {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    try {
        const parsed = choice.safeParse(JSON.parse(raw));
        if (!parsed.success) return;
        const c = parsed.data;
        if (c.method === 'implied' && !(c.gdpr === false && c.lgpd === false && typeof c.ccpa === 'boolean')) return;
        if (c.observedAt > now || now - c.observedAt >= MAX_AGE_MS) return;
        const fresh = (at: number | undefined): at is number => at !== undefined && at <= c.observedAt && now - at < MAX_AGE_MS;
        const result: SignupAdvertising = {
            advertising_consent_method: c.method,
            advertising_consent_timestamp: new Date(c.observedAt).toISOString()
        };
        if (c.fbclid && fresh(c.fbclidAt)) result.advertising_fbc = `fb.1.${c.fbclidAt}.${c.fbclid}`;
        if (c.oppref && fresh(c.opprefAt)) {
            result.advertising_oppref = c.oppref;
            result.advertising_oppref_click_timestamp = new Date(c.opprefAt).toISOString();
        }
        return result.advertising_fbc || result.advertising_oppref ? result : undefined;
    } catch {
        return;
    }
}

export function signupAdvertisingFromRequest(req: Pick<Request, 'cookies' | 'headers'>, email: string): SignupAdvertising | undefined {
    const isSignupCreatorInternal = isInternalAccount([{ email }]);
    if (req.headers['sec-gpc'] === '1' || isSignupCreatorInternal) return;
    const advertising =
        envs.SIGNUP_AD_CONTEXT_ENABLED && envs.SIGNUP_AD_CONTEXT_COOKIE_NAME
            ? parseSignupAdvertising(req.cookies?.[envs.SIGNUP_AD_CONTEXT_COOKIE_NAME])
            : undefined;
    const google =
        envs.SIGNUP_GOOGLE_CONTEXT_ENABLED && envs.SIGNUP_GOOGLE_CONTEXT_COOKIE_NAME
            ? parseSignupGoogleAdvertising(req.cookies?.[envs.SIGNUP_GOOGLE_CONTEXT_COOKIE_NAME])
            : undefined;
    // The creator is known here before the account event, unlike the later async company update.
    return advertising || google ? { ...advertising, ...google, ...(google ? { is_signup_creator_internal: isSignupCreatorInternal } : {}) } : undefined;
}

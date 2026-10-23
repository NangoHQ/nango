import * as z from 'zod';

import type { SignupAdvertising } from '@nangohq/types';

const MAX_AGE_MS = 86_400_000;
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
        clickType: z.enum(['gclid', 'gbraid', 'wbraid']),
        clickId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/),
        clickAt: z.number().int().positive(),
        adUserData: z.literal('granted'),
        adPersonalization: z.literal('granted')
    })
    .strict();

/** Separate cookie keeps the released Meta/OpenAI strict schema compatible with either rollout order. */
export function parseSignupGoogleAdvertising(raw: unknown, now = Date.now()): SignupAdvertising | undefined {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    try {
        const parsed = choice.safeParse(JSON.parse(raw));
        if (!parsed.success) return;
        const c = parsed.data;
        if (c.method === 'implied' && !(c.gdpr === false && c.lgpd === false && typeof c.ccpa === 'boolean')) return;
        if (c.observedAt > now || now - c.observedAt >= MAX_AGE_MS || c.clickAt > c.observedAt || now - c.clickAt >= MAX_AGE_MS) return;
        return {
            advertising_google_click_type: c.clickType,
            advertising_google_click_id: c.clickId,
            advertising_google_click_timestamp: new Date(c.clickAt).toISOString(),
            advertising_google_consent_method: c.method,
            advertising_google_consent_timestamp: new Date(c.observedAt).toISOString(),
            advertising_google_ad_user_data: c.adUserData,
            advertising_google_ad_personalization: c.adPersonalization
        };
    } catch {
        // Malformed optional attribution must never block account creation.
        return;
    }
}

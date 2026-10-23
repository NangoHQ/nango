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
        clickId: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/),
        clickAt: z.number().int().positive()
    })
    .strict();

/** Optional click-only metadata. The cookie name binds the platform; no browser-supplied identity. */
export function parseSignupSocialAdvertising(raw: unknown, platform: 'x' | 'reddit', now = Date.now()): SignupAdvertising | undefined {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    try {
        const parsed = choice.safeParse(JSON.parse(raw));
        if (!parsed.success) return;
        const c = parsed.data;
        if (c.method === 'implied' && !(c.gdpr === false && c.lgpd === false && typeof c.ccpa === 'boolean')) return;
        if (c.observedAt > now || now - c.observedAt >= MAX_AGE_MS || c.clickAt > c.observedAt || now - c.clickAt >= MAX_AGE_MS) return;
        if (platform === 'x')
            return {
                advertising_x_click_id: c.clickId,
                advertising_x_click_timestamp: new Date(c.clickAt).toISOString(),
                advertising_x_consent_method: c.method,
                advertising_x_consent_timestamp: new Date(c.observedAt).toISOString()
            };
        return {
            advertising_reddit_click_id: c.clickId,
            advertising_reddit_click_timestamp: new Date(c.clickAt).toISOString(),
            advertising_reddit_consent_method: c.method,
            advertising_reddit_consent_timestamp: new Date(c.observedAt).toISOString()
        };
    } catch {
        return; // Optional attribution must never block account creation.
    }
}

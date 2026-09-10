import { z } from 'zod';

import type { OAuthConsentInteraction, OAuthConsentResource } from '@nangohq/types';

const hostname = z.string().min(1).max(253);

export const oauthConsentResourceSchema = z
    .object({
        resource: z.string().url().max(2048),
        hostname,
        scopes: z.array(z.string().min(1).max(128)).min(1).max(64)
    })
    .strict() satisfies z.ZodType<OAuthConsentResource>;

export const oauthConsentInteractionSchema = z
    .object({
        interactionId: z.string().min(1).max(128),
        expiresAt: z.string().datetime(),
        csrfToken: z.string().min(32).max(256),
        client: z
            .object({
                name: z.string().min(1).max(120),
                hostname,
                verified: z.literal(false)
            })
            .strict(),
        callbackHostname: hostname,
        account: z.object({ name: z.string().min(1).max(120) }).strict(),
        resources: z.array(oauthConsentResourceSchema).min(1).max(16)
    })
    .strict() satisfies z.ZodType<OAuthConsentInteraction>;

export const oauthConsentDecisionSchema = z.object({ csrfToken: z.string().min(32).max(256) }).strict();
export const oauthLoginHandoffSchema = z.object({ state: z.string().min(32).max(256) }).strict();

export const oauthConsentSuccessSchema = z.object({ data: oauthConsentInteractionSchema }).strict();
export const oauthConsentDecisionSuccessSchema = z.object({ data: z.object({ resumeUrl: z.string().url().max(4096) }).strict() }).strict();
export const oauthLoginHandoffSuccessSchema = z
    .object({ data: z.object({ consumeUrl: z.string().url().max(4096), code: z.string().min(32).max(256) }).strict() })
    .strict();

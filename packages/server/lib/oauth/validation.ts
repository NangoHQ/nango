import { z } from 'zod';

import type { GetOAuthHandoffCallback, OAuthConsentInteraction, PostOAuthApprove, PostOAuthHandoff } from '@nangohq/types';

export const opaqueValue = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);
export const interactionParams = z.strictObject({ uid: opaqueValue });
export const emptyObject = z.strictObject({});
export const decisionBody: z.ZodType<PostOAuthApprove['Body']> = z.strictObject({ csrfToken: opaqueValue });
export const handoffBody: z.ZodType<PostOAuthHandoff['Body']> = z.strictObject({ state: opaqueValue });
export const handoffQuery: z.ZodType<GetOAuthHandoffCallback['Querystring']> = z.strictObject({ code: opaqueValue });
export const interactionResponse: z.ZodType<OAuthConsentInteraction> = z.strictObject({
    clientName: z.string().max(120),
    clientHostname: z.string().max(253),
    callbackHostname: z.string().max(253),
    accountName: z.string().max(120),
    resources: z
        .array(z.strictObject({ resource: z.url().max(2048), scopes: z.array(z.string().min(1).max(128)).min(1).max(100) }))
        .min(1)
        .max(20),
    expiresAt: z.iso.datetime(),
    csrfToken: opaqueValue
});

export class OAuthConsentError extends Error {
    constructor(
        readonly status: 400 | 401 | 403 | 409 | 410,
        readonly code:
            | 'unauthorized'
            | 'forbidden'
            | 'feature_disabled'
            | 'interaction_expired'
            | 'interaction_completed'
            | 'invalid_interaction'
            | 'invalid_handoff'
            | 'invalid_body'
            | 'invalid_query_params'
    ) {
        super(code);
    }
}

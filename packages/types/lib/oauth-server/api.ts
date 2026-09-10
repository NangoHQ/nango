import type { ApiError } from '../api.js';

export type OAuthConsentErrorCode =
    | 'consent_disabled'
    | 'interaction_expired'
    | 'interaction_completed'
    | 'interaction_invalid'
    | 'login_required'
    | 'invalid_csrf'
    | 'invalid_origin'
    | 'user_suspended'
    | 'account_unavailable';

export interface OAuthConsentResource {
    resource: string;
    hostname: string;
    scopes: string[];
}

export interface OAuthConsentInteraction {
    interactionId: string;
    expiresAt: string;
    csrfToken: string;
    client: {
        name: string;
        hostname: string;
        verified: false;
    };
    callbackHostname: string;
    account: {
        name: string;
    };
    resources: OAuthConsentResource[];
}

export interface GetOAuthConsentInteraction {
    Audit: { kind: 'no-audit'; reason: 'read-only interaction lookup' };
    Params: { uid: string };
    Reply:
        | { status: 200; body: { data: OAuthConsentInteraction } }
        | { status: 202; body: { data: { resumeUrl: string } } }
        | { status: 401; body: ApiError<'login_required'> }
        | { status: 403; body: ApiError<'consent_disabled' | 'user_suspended' | 'account_unavailable'> }
        | { status: 404 | 409 | 410; body: ApiError<'interaction_invalid' | 'interaction_completed' | 'interaction_expired'> };
}

export interface PostOAuthConsentDecision {
    Audit: { kind: 'audit'; resource: 'oauth_grant'; action: 'approved' | 'denied'; scope: 'account' };
    Params: { uid: string };
    Body: { csrfToken: string };
    Reply: { status: 200; body: { data: { resumeUrl: string } } } | { status: 400 | 403 | 404 | 409 | 410; body: ApiError<OAuthConsentErrorCode> };
}

import type { ApiError, ValidationError } from '../api.js';

export type OAuthConsentErrorCode =
    | 'interaction_expired'
    | 'interaction_completed'
    | 'interaction_invalid'
    | 'login_required'
    | 'invalid_origin'
    | 'user_suspended'
    | 'account_unavailable';

export interface OAuthConsentResource {
    hostname: string;
    scopes: string[];
}

export interface OAuthConsentInteraction {
    client: {
        name: string;
        hostname: string;
    };
    redirectUri: string;
    account: {
        name: string;
    };
    resource: OAuthConsentResource;
}

export interface GetOAuthConsentInteraction {
    Audit: { kind: 'no-audit'; reason: 'read-only interaction lookup' };
    Params: { uid: string };
    Reply:
        | { status: 200; body: { data: OAuthConsentInteraction } }
        | { status: 202; body: { data: { resumeUrl: string } } }
        | { status: 401; body: ApiError<'login_required'> }
        | { status: 403; body: ApiError<'user_suspended' | 'account_unavailable'> }
        | { status: 404 | 409 | 410; body: ApiError<'interaction_invalid' | 'interaction_completed' | 'interaction_expired'> };
}

export interface PostOAuthConsentDecision {
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Params: { uid: string };
    Body: never;
    Reply:
        | { status: 200; body: { data: { resumeUrl: string } } }
        | { status: 400; body: ApiError<'invalid_body', ValidationError[]> }
        | { status: 403 | 404 | 409 | 410; body: ApiError<OAuthConsentErrorCode> };
}

import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';

export interface OAuthConsentResource {
    resource: string;
    scopes: string[];
}

export interface OAuthConsentInteraction {
    clientName: string;
    clientHostname: string;
    callbackHostname: string;
    accountName: string;
    resources: OAuthConsentResource[];
    expiresAt: string;
    csrfToken: string;
}

export type OAuthInteractionError = ApiError<'unauthorized' | 'interaction_expired' | 'interaction_completed' | 'invalid_interaction'>;

export type GetOAuthInteraction = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'read-only consent details' };
    Method: 'GET';
    Path: '/oauth/interaction/:uid/details';
    Params: { uid: string };
    Success: { data: OAuthConsentInteraction };
    Error: OAuthInteractionError;
}>;

export type PostOAuthApprove = ApiEndpoint<{
    Audit: AuditPolicy<'oauth_grant', 'approved', 'account'>;
    Method: 'POST';
    Path: '/oauth/interaction/:uid/approve';
    Params: { uid: string };
    Body: { csrfToken: string };
    Success: { data: { redirectUrl: string; grantId: string } };
    Error: OAuthInteractionError;
}>;

export type PostOAuthDeny = ApiEndpoint<{
    Audit: AuditPolicy<'oauth_grant', 'denied', 'account'>;
    Method: 'POST';
    Path: '/oauth/interaction/:uid/deny';
    Params: { uid: string };
    Body: { csrfToken: string };
    Success: { data: { redirectUrl: string } };
    Error: OAuthInteractionError;
}>;

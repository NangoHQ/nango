import type { AccountApiKeyScope } from '../api-keys/scopes.js';
import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { MFACredential } from '../mfa/credential.js';
import type { ApiUser } from '../user/api.js';

export interface AccountApiKey {
    id: number;
    uuid: string;
    display_name: string;
    scopes: AccountApiKeyScope[];
    secret: string;
    last_used_at: string | null;
    created_at: string;
}

export type ListAccountApiKeys = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/api-keys';
    Success: { data: AccountApiKey[] };
}>;

export type CreateAccountApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'created', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/api-keys';
    Body: { display_name: string };
    Success: {
        data: Omit<AccountApiKey, 'last_used_at'>;
    };
    Error: ApiError<'conflict' | 'resource_capped'>;
}>;

export type DeleteAccountApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'deleted', 'account'>;
    Method: 'DELETE';
    Path: '/api/v1/account/api-keys/:keyId';
    Params: { keyId: number };
    Success: { success: true };
    Error: ApiError<'not_found'>;
}>;

export type PostSignup = ApiEndpoint<{
    Audit: AuditPolicy<'app_auth', 'signup', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/signup';
    Body: {
        email: string;
        name: string;
        password: string;
        token?: string | undefined;
        foundUs?: string | undefined;
    };
    Error:
        | ApiError<'email_already_verified'>
        | ApiError<'error_creating_user'>
        | ApiError<'user_already_exists'>
        | ApiError<'error_creating_account'>
        | ApiError<'not_found'>
        | ApiError<'email_not_verified'>;
    Success: {
        data: {
            uuid: string;
            verified: boolean;
        };
    };
}>;

export type ConfirmEmail = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/verify/code';
    Body: {
        token: string;
    };
    Error: ApiError<'error_validating_user'> | ApiError<'invalid_token'> | ApiError<'token_expired'>;
    Success: {
        user: ApiUser;
    };
}>;

export type ResendVerificationEmailByUuid = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/resend-verification-email/by-uuid';
    Body: { uuid: string };
    Error: ApiError<'user_not_found'> | ApiError<'email_already_verified'>;
    Success: {
        success: boolean;
    };
}>;

export type ResendVerificationEmailByEmail = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/resend-verification-email/by-email';
    Body: { email: string };
    Error: ApiError<'user_not_found'> | ApiError<'email_already_verified'>;
    Success: {
        success: boolean;
    };
}>;

export type GetEmailByUuid = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/email/:uuid';
    Params: { uuid: string };
    Error: ApiError<'user_not_found'>;
    Success: {
        email: string;
        verified: boolean;
    };
}>;

export type GetEmailByExpiredToken = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/email/expired-token/:token';
    Params: { token: string };
    Error: ApiError<'user_not_found'> | ApiError<'error_refreshing_token'>;
    Success: {
        email: string;
        verified: boolean;
        uuid: string;
    };
}>;

export type PostSignin = ApiEndpoint<{
    Audit: AuditPolicy<'app_auth', 'login', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/signin';
    Body: {
        email: string;
        password: string;
        returnTo?: string;
    };
    Error: ApiError<'email_not_verified'> | ApiError<'user_suspended'> | ApiError<'unauthorized'>;
    Success: { user: ApiUser; url: string } | { data: { mfaRequired: true } };
}>;

export type PostLogout = ApiEndpoint<{
    Audit: AuditPolicy<'app_auth', 'logout', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/logout';
    Success: never;
}>;

export type PostForgotPassword = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/forgot-password';
    Body: {
        email: string;
    };
    Success: {
        success: true;
    };
}>;

export type PutResetPassword = ApiEndpoint<{
    Audit: AuditPolicy<'app_auth', 'password_reset', 'account'>;
    Method: 'PUT';
    Path: '/api/v1/account/reset-password';
    Body: {
        token: string;
        password: string;
        mfa?: MFACredential | undefined;
    };
    Error: ApiError<'user_not_found'> | ApiError<'invalid_token'> | ApiError<'invalid_mfa_code'> | ApiError<'mfa_code_required'>;
    Success: {
        success: true;
    };
}>;

export type PostManagedSignup = ApiEndpoint<{
    // Only returns the IdP authorization URL — no user, no session, no resolvable actor. The managed
    // signup/login is recorded later on the callback once the session is established.
    Audit: { kind: 'no-audit'; reason: 'initiates SSO redirect, no auth state change' };
    Method: 'POST';
    Path: '/api/v1/account/managed/signup';
    Body: {
        provider: 'GoogleOAuth';
        token?: string | undefined;
    };
    Success: {
        data: {
            url: string;
        };
    };
}>;

export type GetManagedEmailVerification = ApiEndpoint<{
    // Read-only: returns the pending verification email from the session, no auth state change.
    Audit: { kind: 'no-audit'; reason: 'read-only, no auth state change' };
    Method: 'GET';
    Path: '/api/v1/account/managed/verification';
    Error: ApiError<'not_found'>;
    Success: {
        data: {
            email: string;
        };
    };
}>;

export type PostManagedEmailVerification = ApiEndpoint<{
    // Establishes a session (login, or signup when a new user is created); the emitted action is
    // resolved at runtime, so the policy declares both.
    Audit: AuditPolicy<'app_auth', 'login' | 'signup', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/managed/verification';
    Body: {
        code: string;
    };
    Error: ApiError<'invalid_verification_code'> | ApiError<'not_found'>;
    Success: {
        data: {
            url: string;
        };
    };
}>;

export type GetManagedCallback = ApiEndpoint<{
    // SSO callback establishes a session (login, or signup when a new user is created); the emitted
    // action is resolved at runtime, so the policy declares both.
    Audit: AuditPolicy<'app_auth', 'login' | 'signup', 'account'>;
    Method: 'GET';
    Path: '/api/v1/login/callback';
    Querystring: {
        code: string;
        state?: string | undefined;
    };
    Error: ApiError<'error_creating_user'> | ApiError<'user_already_exists'> | ApiError<'error_creating_account'>;
    Success: {
        data: {
            url: string;
        };
    };
}>;

export type GetOnboardingHearAboutUs = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/onboarding/hear-about-us';
    Error: ApiError<'unauthorized'>;
    Success: {
        data: {
            showHearAboutUs: boolean;
        };
    };
}>;

export type GetOnboardingAccountDiscovery = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/onboarding/account-discovery';
    Error: ApiError<'forbidden'>;
    Success: {
        data: {
            suggestedAccountName: string | null;
        };
    };
}>;

export type PostOnboardingRequestInvite = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/onboarding/request-invite';
    Body: never;
    Error: ApiError<'not_found'> | ApiError<'email_delivery_failed'>;
    Success: {
        data: {
            success: true;
        };
    };
}>;
export type PostOnboardingHearAboutUs = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/account/onboarding/hear-about-us';
    Body: {
        source: 'my_team_already_using' | 'recommended' | 'search_engine' | 'llm_search' | 'social_media' | 'dont_remember' | 'other' | 'skipped';
    };
    Error: ApiError<'unauthorized'> | ApiError<'forbidden'>;
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

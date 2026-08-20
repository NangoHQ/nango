import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { ApiUser } from '../user/api.js';
import type { MFACredential } from './credential.js';

type MFAError = ApiError<'invalid_mfa_code'> | ApiError<'mfa_already_enabled'> | ApiError<'mfa_enrollment_not_found'> | ApiError<'mfa_not_enabled'>;

export type GetMFAStatus = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/account/mfa';
    Success: { data: { enabled: boolean } };
}>;

export type PostMFAEnrollment = ApiEndpoint<{
    Audit: AuditPolicy<'mfa', 'enrolled', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/mfa/enroll';
    Error: ApiError<'mfa_already_enabled'>;
    Success: { data: { otpauthUri: string } };
}>;

export type PostMFAActivation = ApiEndpoint<{
    Audit: AuditPolicy<'mfa', 'enabled', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/mfa/activate';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_enrollment_not_found'>;
    Success: { data: { recoveryCodes: string[] } };
}>;

export type PostMFARecoveryCodes = ApiEndpoint<{
    Audit: AuditPolicy<'mfa', 'recovery_regenerated', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/mfa/recovery-codes';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_not_enabled'>;
    Success: { data: { recoveryCodes: string[] } };
}>;

export type DeleteMFA = ApiEndpoint<{
    Audit: AuditPolicy<'mfa', 'disabled', 'account'>;
    Method: 'DELETE';
    Path: '/api/v1/account/mfa';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_not_enabled'>;
    Success: { success: true };
}>;

export type MFAEndpointError = MFAError;

export type PostMFALoginVerification = ApiEndpoint<{
    Audit: AuditPolicy<'mfa', 'verified', 'account'>;
    Method: 'POST';
    Path: '/api/v1/account/mfa/login/verify';
    Body: MFACredential;
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_login_expired'>;
    Success: { data: { user: ApiUser; url: string } };
}>;

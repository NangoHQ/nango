import type { ApiError, Endpoint } from '../api.js';
import type { ApiUser } from '../user/api.js';

type MFAError = ApiError<'invalid_mfa_code'> | ApiError<'mfa_already_enabled'> | ApiError<'mfa_enrollment_not_found'> | ApiError<'mfa_not_enabled'>;

export type GetMFAStatus = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/account/mfa';
    Success: { data: { enabled: boolean } };
}>;

export type PostMFAEnrollment = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/mfa/enroll';
    Error: ApiError<'mfa_already_enabled'>;
    Success: { data: { otpauthUri: string } };
}>;

export type PostMFAActivation = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/mfa/activate';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_enrollment_not_found'>;
    Success: { data: { recoveryCodes: string[] } };
}>;

export type PostMFARecoveryCodes = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/mfa/recovery-codes';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_not_enabled'>;
    Success: { data: { recoveryCodes: string[] } };
}>;

export type DeleteMFA = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/account/mfa';
    Body: { code: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_not_enabled'>;
    Success: { success: true };
}>;

export type MFAEndpointError = MFAError;

export type PostMFALoginVerification = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/mfa/login/verify';
    Body: { type: 'code'; code: string } | { type: 'recoveryCode'; recoveryCode: string };
    Error: ApiError<'invalid_mfa_code'> | ApiError<'mfa_login_expired'>;
    Success: { data: { user: ApiUser; url: string } };
}>;

import type { ApiError, Endpoint } from '../api';
import type { WebUser } from '../user/api';

export type Signup = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/signup';
    Body: {
        email: string;
        name: string;
        password: string;
    };
    Error:
        | ApiError<'email_already_verified'>
        | ApiError<'error_creating_user'>
        | ApiError<'user_already_exists'>
        | ApiError<'error_creating_account'>
        | ApiError<'email_not_verified'>;
    Success: {
        uuid: string;
    };
}>;

export type SignupWithToken = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/signup/token';
    Body: {
        email: string;
        name: string;
        password: string;
        token: string;
        accountId: number;
    };
    Error:
        | ApiError<'error_creating_user'>
        | ApiError<'user_already_exists'>
        | ApiError<'invalid_invite_token'>
        | ApiError<'error_logging_in'>
        | ApiError<'invalid_account_id'>;
    Success: {
        user: WebUser;
    };
}>;

export type ValidateEmailAndLogin = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/verify/code';
    Body: {
        token: string;
    };
    Error: ApiError<'error_logging_in'> | ApiError<'error_validating_user'> | ApiError<'token_expired'> | ApiError<'error_refreshing_token'>;
    Success: {
        user: WebUser;
    };
}>;

export type ResendVerificationEmailByUuid = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/resend-verification-email/by-uuid';
    Body: { uuid: string };
    Error: ApiError<'user_not_found'> | ApiError<'email_already_verified'>;
    Success: {
        success: boolean;
    };
}>;

export type ResendVerificationEmailByEmail = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/resend-verification-email/by-email';
    Body: { email: string };
    Error: ApiError<'user_not_found'> | ApiError<'email_already_verified'>;
    Success: {
        success: boolean;
    };
}>;

export type GetEmailByUuid = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/account/email/:uuid';
    Params: { uuid: string };
    Error: ApiError<'user_not_found'>;
    Success: {
        email: string;
        verified: boolean;
    };
}>;

export type GetEmailByExpiredToken = Endpoint<{
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

export type Signin = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/account/signin';
    Body: {
        email: string;
        password: string;
    };
    Error: ApiError<'email_not_verified'> | ApiError<'unauthorized'>;
    Success: {
        user: WebUser;
    };
}>;

export type PostForgotPassword = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/account/forgot-password';
    Body: {
        email: string;
    };
    Error: ApiError<'user_not_found'>;
    Success: {
        success: true;
    };
}>;

export type PutResetPassword = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/account/reset-password';
    Body: {
        token: string;
        password: string;
    };
    Error: ApiError<'user_not_found'> | ApiError<'invalid_token'>;
    Success: {
        success: true;
    };
}>;

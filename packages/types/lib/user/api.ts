import type { ApiEndpoint, ApiError, Endpoint } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { MFACredential } from '../mfa/credential.js';
import type { Role } from './db.js';

export type GetUser = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: `/api/v1/user`;
    Success: {
        data: ApiUserWithGrants;
    };
}>;

export type InternalGetUsers = Endpoint<{
    Method: 'GET';
    Path: `/internal/users`;
    Querystring: { accountId: number };
    Success: {
        data: ApiUser[];
    };
}>;

export type PatchUser = ApiEndpoint<{
    Audit: AuditPolicy<'user', 'updated', 'account'>;
    Method: 'PATCH';
    Path: `/api/v1/user`;
    Body: {
        name?: string | undefined;
        gettingStartedClosed?: boolean | undefined;
    };
    Success: {
        data: ApiUser;
    };
}>;

export interface ApiUser {
    id: number;
    accountId: number;
    email: string;
    name: string;
    uuid: string;
    role: Role;
    gettingStartedClosed: boolean;
}

export type ApiGrant = { can: string[]; where: string[] };

export type ApiUserWithGrants = ApiUser & {
    grants: readonly ApiGrant[];
    hasPassword: boolean;
};

export type PutUserPassword = ApiEndpoint<{
    Audit: AuditPolicy<'app_auth', 'password_changed', 'account'>;
    Method: 'PUT';
    Path: `/api/v1/user/password`;
    Body: { oldPassword: string; newPassword: string; mfa?: MFACredential | undefined };
    Error: ApiError<'incorrect_password'> | ApiError<'invalid_mfa_code'> | ApiError<'mfa_code_required'>;
    Success: { success: true };
}>;

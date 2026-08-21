import type { ApiEndpoint, ApiError, ApiTimestamps } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { DBInvitation } from '../invitations/db.js';
import type { ApiUser } from '../user/api.js';
import type { Role } from '../user/db.js';
import type { DBTeam } from './db.js';
import type { Merge } from 'type-fest';

export type GetTeam = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Success: {
        data: {
            account: ApiTeam;
            users: ApiTeamUser[];
            invitedUsers: ApiInvitation[];
            isAdminTeam: boolean;
            // Whether MFA is available for this account. When false the dashboard hides per-member 2FA state.
            mfaFeatureEnabled: boolean;
        };
    };
}>;

export interface ApiTeamUser extends ApiUser {
    mfaEnabled: boolean;
}

export type ApiInvitation = Merge<Omit<DBInvitation, 'token'>, ApiTimestamps>;
export type ApiTeam = Merge<DBTeam, ApiTimestamps>;

export type PutTeam = ApiEndpoint<{
    Audit: AuditPolicy<'team', 'updated', 'account'>;
    Method: 'PUT';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Body: { name: string };
    Success: {
        data: ApiTeam;
    };
}>;

export type DeleteTeamUser = ApiEndpoint<{
    Audit: AuditPolicy<'member', 'removed', 'account'>;
    Method: 'DELETE';
    Path: '/api/v1/team/users/:id';
    Querystring: { env: string };
    Params: { id: number };
    Error: ApiError<'user_not_found'> | ApiError<'forbidden_self_delete'>;
    Success: {
        data: { success: true };
    };
}>;

export type PatchTeamUser = ApiEndpoint<{
    Audit: AuditPolicy<'member', 'role_changed', 'account'>;
    Method: 'PATCH';
    Path: '/api/v1/team/users/:id';
    Querystring: { env: string };
    Params: { id: number };
    Body: { role: Role };
    Error: ApiError<'user_not_found'> | ApiError<'forbidden_self_demotion'>;
    Success: {
        data: { success: true };
    };
}>;

import type { ApiEndpoint, ApiError, ApiTimestamps } from '../api.js';
import type { DBInvitation } from '../invitations/db.js';
import type { ApiUser } from '../user/api.js';
import type { Role } from '../user/db.js';
import type { DBTeam } from './db.js';
import type { Merge } from 'type-fest';

export type GetTeam = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Success: {
        data: {
            account: ApiTeam;
            users: ApiUser[];
            invitedUsers: ApiInvitation[];
            isAdminTeam: boolean;
        };
    };
}>;

export type ApiInvitation = Merge<Omit<DBInvitation, 'token'>, ApiTimestamps>;
export type ApiTeam = Merge<DBTeam, ApiTimestamps>;

export type PutTeam = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
    Method: 'PUT';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Body: { name: string };
    Success: {
        data: ApiTeam;
    };
}>;

export type DeleteTeamUser = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
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
    Audit: { resource: 'member'; action: 'role_changed'; scope: 'account' };
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

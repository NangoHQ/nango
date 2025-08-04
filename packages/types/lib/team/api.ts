import type { ApiError, ApiTimestamps, Endpoint } from '../api.js';
import type { DBTeam } from './db.js';
import type { DBInvitation } from '../invitations/db.js';
import type { ApiUser } from '../user/api.js';
import type { Merge } from 'type-fest';

export type GetTeam = Endpoint<{
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

export type PutTeam = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Body: { name: string };
    Success: {
        data: ApiTeam;
    };
}>;

export type DeleteTeamUser = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/team/users/:id';
    Querystring: { env: string };
    Params: { id: number };
    Error: ApiError<'user_not_found'> | ApiError<'forbidden_self_delete'>;
    Success: {
        data: { success: true };
    };
}>;

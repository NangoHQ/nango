import type { Merge } from 'type-fest';
import type { ApiError, ApiTimestamps, Endpoint } from '../api';
import type { DBInvitation } from '../invitations/db';
import type { ApiUser } from '../user/api';
import type { DBTeam } from './db';

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

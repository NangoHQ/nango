import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { DBInvitation } from '../invitations/db';
import type { WebUser } from '../user/api';
import type { DBTeam } from './db';

export type GetTeam = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Success: {
        data: {
            account: ApiTeam;
            users: WebUser[];
            invitedUsers: ApiInvitation[];
            isAdminTeam: boolean;
        };
    };
}>;

export type ApiInvitation = Omit<DBInvitation, 'token'>;
export type ApiTeam = Merge<DBTeam, ApiTimestamps>;

export type PutTeam = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/team';
    Querystring: { env: string };
    Body: { name: string };
    Success: {
        data: DBTeam;
    };
}>;

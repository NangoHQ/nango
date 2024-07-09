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
            invitedUsers: Omit<DBInvitation, 'token'>[];
            isAdminTeam: boolean;
        };
    };
}>;

export type ApiTeam = Merge<DBTeam, ApiTimestamps>;

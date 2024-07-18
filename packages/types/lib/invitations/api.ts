import type { Endpoint } from '../api';
import type { ApiInvitation, ApiTeam } from '../team/api';
import type { ApiUser } from '../user/api';

export type PostInvite = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/invite';
    Querystring: { env: string };
    Body: { emails: string[] };
    Success: {
        data: { invited: string[] };
    };
}>;

export type DeleteInvite = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/invite';
    Querystring: { env: string };
    Body: { email: string };
    Success: {
        data: { success: boolean };
    };
}>;

export type GetInvite = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/invite/:id';
    Params: { id: string };
    Success: {
        data: {
            invitedBy: ApiUser;
            invitation: ApiInvitation;
            newTeam: ApiTeam;
            newTeamUsers: number;
        };
    };
}>;

export type AcceptInvite = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/invite/:id';
    Params: { id: string };
    Success: {
        data: { success: boolean };
    };
}>;

export type DeclineInvite = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/invite/:id';
    Params: { id: string };
    Success: {
        data: { success: boolean };
    };
}>;

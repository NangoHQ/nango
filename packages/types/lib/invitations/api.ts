import type { ApiEndpoint, ApiError } from '../api.js';
import type { ApiInvitation, ApiTeam } from '../team/api.js';
import type { ApiUser } from '../user/api.js';
import type { Role } from '../user/db.js';

export type PostInvite = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/api/v1/invite';
    Querystring: { env: string };
    Body: { emails: string[]; role?: Role };
    Success: {
        data: { invited: string[] };
    };
}>;

export type DeleteInvite = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
    Method: 'DELETE';
    Path: '/api/v1/invite';
    Querystring: { env: string };
    Body: { email: string };
    Success: {
        data: { success: boolean };
    };
}>;

export type GetInvite = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
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
    Errors: ApiError<'not_found'>;
}>;

export type AcceptInvite = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/api/v1/invite/:id';
    Params: { id: string };
    Success: {
        data: { success: boolean };
    };
}>;

export type DeclineInvite = ApiEndpoint<{
    Audit: { audit: false; reason: 'TODO: audit coverage pending' };
    Method: 'DELETE';
    Path: '/api/v1/invite/:id';
    Params: { id: string };
    Success: {
        data: { success: boolean };
    };
}>;

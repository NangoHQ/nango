import type { Endpoint } from '../api';

export type PostInvite = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/team/invite';
    Querystring: { env: string };
    Body: { emails: string[] };
    Success: {
        data: { invited: string[] };
    };
}>;

export type DeleteInvite = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/team/invite';
    Querystring: { env: string };
    Body: { email: string };
    Success: {
        data: { success: boolean };
    };
}>;

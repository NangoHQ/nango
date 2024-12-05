import type { Endpoint } from '../api';

export type GetUser = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/user`;
    Success: {
        data: ApiUser;
    };
}>;

export type PatchUser = Endpoint<{
    Method: 'PATCH';
    Path: `/api/v1/user`;
    Body: { name: string };
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
}

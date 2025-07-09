import type { Endpoint } from '../api.js';

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

export type PutUserPassword = Endpoint<{
    Method: 'PUT';
    Path: `/api/v1/user/password`;
    Body: { oldPassword: string; newPassword: string };
    Success: { success: true };
}>;

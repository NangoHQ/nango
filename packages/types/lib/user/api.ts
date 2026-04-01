import type { Endpoint } from '../api.js';
import type { Role } from './db.js';

export type GetUser = Endpoint<{
    Method: 'GET';
    Path: `/api/v1/user`;
    Success: {
        data: ApiUserWithPermissions;
    };
}>;

export type InternalGetUsers = Endpoint<{
    Method: 'GET';
    Path: `/internal/users`;
    Querystring: { accountId: number };
    Success: {
        data: ApiUser[];
    };
}>;

export type PatchUser = Endpoint<{
    Method: 'PATCH';
    Path: `/api/v1/user`;
    Body: {
        name?: string | undefined;
        gettingStartedClosed?: boolean | undefined;
    };
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
    role: Role;
    gettingStartedClosed: boolean;
}

export type AllowedPermissions = Partial<
    Record<string, Partial<Record<'production' | 'non-production' | 'global', ('create' | 'read' | 'update' | 'delete' | '*')[]>>>
>;

export type ApiUserWithPermissions = ApiUser & {
    role: Role;
    permissions: AllowedPermissions;
};

export type PutUserPassword = Endpoint<{
    Method: 'PUT';
    Path: `/api/v1/user/password`;
    Body: { oldPassword: string; newPassword: string };
    Success: { success: true };
}>;

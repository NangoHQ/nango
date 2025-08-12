import type { ApiError, Endpoint } from '../api.js';

export type GetSharedCredentialsProviders = Endpoint<{
    Method: 'GET';
    Path: '/internal/shared-credentials/providers';
    Success: {
        success: boolean;
        data: SharedCredentialsOutput[];
    };
}>;

export type GetSharedCredentialsProvider = Endpoint<{
    Method: 'GET';
    Path: '/internal/shared-credentials/providers/:name';
    Params: { name: string };
    Success: {
        success: boolean;
        data: SharedCredentialsOutput;
    };
}>;

export type PostSharedCredentialsProvider = Endpoint<{
    Method: 'POST';
    Path: '/internal/shared-credentials/providers';
    Body: SharedCredentialsBodyInput;
    Success: {
        success: boolean;
    };
    Error: ApiError<'invalid_body' | 'shared_credentials_already_exists'>;
}>;

export type PatchSharedCredentialsProvider = Endpoint<{
    Method: 'PATCH';
    Path: '/internal/shared-credentials/providers/:id';
    Params: { id: string };
    Body: SharedCredentialsBodyInput & { name: string };
    Success: {
        success: boolean;
    };
    Error: ApiError<'invalid_body' | 'shared_credentials_provider_not_found' | 'shared_credentials_already_exists'>;
}>;

export interface SharedCredentialsBodyInput {
    name?: string | undefined;
    client_id: string;
    client_secret: string;
    scopes?: string | undefined;
}

export interface SharedCredentialsOutput {
    id: number;
    name: string;
    credentials: {
        client_id: string;
        client_secret: string;
        scopes?: string | undefined;
    };
    created_at: string;
    updated_at: string;
}

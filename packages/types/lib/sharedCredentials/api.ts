import type { ApiEndpoint, ApiError } from '../api.js';

export type GetSharedCredentialsProviders = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/internal/shared-credentials';
    Success: {
        success: boolean;
        data: SharedCredentialsOutput[];
    };
}>;

export type GetSharedCredentialsProvider = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/internal/shared-credentials/:id';
    Params: { id: number };
    Success: {
        success: boolean;
        data: SharedCredentialsOutput;
    };
}>;

export type PostSharedCredentialsProvider = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/internal/shared-credentials';
    Body: SharedCredentialsBodyInput;
    Success: {
        success: boolean;
    };
    Error: ApiError<'invalid_body' | 'shared_credentials_already_exists' | 'invalid_provider'>;
}>;

export type PatchSharedCredentialsProvider = ApiEndpoint<{
    Audit: { audit: false; reason: 'non-auditable' };
    Method: 'PATCH';
    Path: '/internal/shared-credentials/:id';
    Params: { id: number };
    Body: SharedCredentialsBodyInput;
    Success: {
        success: boolean;
    };
    Error: ApiError<'invalid_body' | 'shared_credentials_provider_not_found' | 'shared_credentials_already_exists' | 'invalid_provider'>;
}>;

export interface SharedCredentialsBodyInput {
    name: string;
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

import type { ApiKeyScope } from '../../api-keys/scopes.js';
import type { ApiError, ApiTimestamps, Endpoint } from '../../api.js';
import type { ApiPlan } from '../../plans/http.api.js';
import type { DBEnvironment, DBExternalWebhook } from '../db.js';
import type { ApiEnvironmentVariable } from '../variable/api.js';
import type { Merge } from 'type-fest';

export type ApiEnvironment = Merge<DBEnvironment, { callback_url: string } & ApiTimestamps>;

export type ApiWebhooks = Omit<DBExternalWebhook, 'id' | 'environment_id' | 'created_at' | 'updated_at'>;

export type GetEnvironments = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/environments';
    Success: {
        data: Pick<DBEnvironment, 'name' | 'is_production'>[];
    };
}>;

export type PostEnvironment = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/environments';
    Body: { name: string };
    Success: {
        data: Pick<DBEnvironment, 'id' | 'name'>;
    };
}>;

export type GetEnvironment = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/environments/current';
    Success: {
        plan: ApiPlan | null;
        environmentAndAccount: {
            environment: ApiEnvironment;
            env_variables: ApiEnvironmentVariable[];
            webhook_settings: ApiWebhooks;
            uuid: string;
            name: string;
            email: string;
            slack_notifications_channel: string | null;
            webhook_signing_key: string | null;
        };
    };
}>;

export type PatchEnvironment = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/environments';
    Body: {
        name?: string | undefined;
        is_production?: boolean | undefined;
        callback_url?: string | undefined;
        hmac_key?: string | undefined;
        hmac_enabled?: boolean | undefined;
        slack_notifications?: boolean | undefined;
        otlp_endpoint?: string | undefined;
        otlp_headers?: { name: string; value: string }[] | undefined;
    };
    Success: {
        data: ApiEnvironment;
    };
    Error: ApiError<'conflict' | 'cannot_toggle_prod_environment'>;
}>;

export type DeleteEnvironment = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/environments';
    Success: never;
    Error: ApiError<'cannot_delete_prod_environment'>;
}>;

export type GetPublicEnvironmentVariables = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/environment-variables';
    Success: { name: string; value: string }[];
}>;

export type ListApiKeys = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/environment/api-keys';
    Success: {
        data: {
            id: number;
            display_name: string;
            scopes: ApiKeyScope[];
            secret: string;
            last_used_at: string | null;
            created_at: string;
        }[];
    };
}>;

export type CreateApiKey = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/environment/api-keys';
    Body: {
        display_name: string;
        scopes?: ApiKeyScope[];
    };
    Success: {
        data: {
            id: number;
            display_name: string;
            scopes: ApiKeyScope[];
            secret: string;
            created_at: string;
        };
    };
    Error: ApiError<'conflict' | 'resource_capped'>;
}>;

export type DeleteApiKey = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/environment/api-keys/:keyId';
    Params: { keyId: number };
    Success: { success: true };
}>;

export type PatchApiKey = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/environment/api-keys/:keyId';
    Params: { keyId: number };
    Body: {
        scopes?: ApiKeyScope[];
        display_name?: string;
    };
    Success: { success: true };
    Error: ApiError<'conflict' | 'not_found'>;
}>;

import type { ApiKeyScope } from '../../api-keys/scopes.js';
import type { ApiEndpoint, ApiError, ApiTimestamps } from '../../api.js';
import type { AuditPolicy } from '../../audit-trail/event.js';
import type { ApiPlan } from '../../plans/http.api.js';
import type { DBEnvironment, DBExternalWebhook } from '../db.js';
import type { ApiEnvironmentVariable } from '../variable/api.js';
import type { Merge } from 'type-fest';

export type ApiEnvironment = Merge<DBEnvironment, { callback_url: string } & ApiTimestamps>;

export type ApiWebhooks = Omit<DBExternalWebhook, 'id' | 'environment_id' | 'created_at' | 'updated_at'>;

export type GetEnvironments = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/environments';
    Success: {
        data: Pick<DBEnvironment, 'name' | 'is_production'>[];
    };
}>;

export type PostEnvironment = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'created', 'account'>;
    Method: 'POST';
    Path: '/api/v1/environments';
    Body: { name: string };
    Success: {
        data: Pick<DBEnvironment, 'id' | 'uuid' | 'name'>;
    };
    Error: ApiError<'conflict' | 'resource_capped' | 'invalid_is_prod_flag'>;
}>;

export type PostPublicEnvironment = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'created', 'account'>;
    Method: 'POST';
    Path: '/environments';
    Body: {
        name: string;
        is_production?: boolean | undefined;
        callback_url?: string | undefined;
        hmac_key?: string | undefined;
        hmac_enabled?: boolean | undefined;
        slack_notifications?: boolean | undefined;
        otlp_endpoint?: string | undefined;
        otlp_headers?: { name: string; value: string }[] | undefined;
    };
    Success: {
        data: Pick<DBEnvironment, 'id' | 'uuid' | 'name'>;
    };
    Error: ApiError<'conflict' | 'resource_capped' | 'invalid_is_prod_flag'>;
}>;

export type DeletePublicEnvironment = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'deleted', 'account'>;
    Method: 'DELETE';
    Path: '/environments/:environmentUuid';
    Params: { environmentUuid: string };
    Success: never;
    Error: ApiError<'cannot_delete_prod_environment'>;
}>;

export type GetEnvironment = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
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
            managed_secret_key: string | null;
        };
    };
}>;

export type PatchEnvironment = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'updated', 'environment'>;
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

export type DeleteEnvironment = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'deleted', 'environment'>;
    Method: 'DELETE';
    Path: '/api/v1/environments';
    Success: never;
    Error: ApiError<'cannot_delete_prod_environment'>;
}>;

export type PostRotateWebhookSigningKey = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'webhook_signing_key_rotated', 'environment'>;
    Method: 'POST';
    Path: '/api/v1/environment/webhook-signing-key/rotate';
    Success: {
        data: { webhook_signing_key: string };
    };
    Error: ApiError<'not_found'> | ApiError<'multiple_webhook_signing_keys'> | ApiError<'rotation_failed'>;
}>;

export type PostPublicRotateWebhookSigningKey = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'webhook_signing_key_rotated', 'environment'>;
    Method: 'POST';
    Path: '/environment/webhook-signing-key/rotate';
    Success: {
        data: { webhook_signing_key: string };
    };
    Error: ApiError<'not_found'> | ApiError<'multiple_webhook_signing_keys'> | ApiError<'rotation_failed'>;
}>;

export type GetPublicEnvironmentVariables = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/environment-variables';
    Success: { name: string; value: string }[];
}>;

export type ListApiKeys = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/environment/api-keys';
    Success: {
        data: {
            id: number;
            uuid: string;
            display_name: string;
            scopes: ApiKeyScope[];
            secret: string;
            last_used_at: string | null;
            created_at: string;
        }[];
    };
}>;

export type CreateApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'created', 'environment'>;
    Method: 'POST';
    Path: '/api/v1/environment/api-keys';
    Body: {
        display_name: string;
        scopes?: ApiKeyScope[];
    };
    Success: {
        data: {
            id: number;
            uuid: string;
            display_name: string;
            scopes: ApiKeyScope[];
            secret: string;
            created_at: string;
        };
    };
    Error: ApiError<'conflict' | 'resource_capped'>;
}>;

export type PostPublicApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'created', 'environment'>;
    Method: 'POST';
    Path: '/environments/:environmentUuid/api-keys';
    Params: { environmentUuid: string };
    Body: {
        display_name: string;
    };
    Success: {
        data: {
            id: number;
            uuid: string;
            display_name: string;
            scopes: ApiKeyScope[];
            secret: string;
            created_at: string;
        };
    };
    Error: ApiError<'conflict' | 'resource_capped'>;
}>;

export type DeletePublicApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'deleted', 'environment'>;
    Method: 'DELETE';
    Path: '/environments/:environmentUuid/api-keys/:keyUuid';
    Params: { environmentUuid: string; keyUuid: string };
    Success: { success: true };
}>;

export type DeleteApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'deleted', 'environment'>;
    Method: 'DELETE';
    Path: '/api/v1/environment/api-keys/:keyId';
    Params: { keyId: number };
    Success: { success: true };
}>;

export type PatchApiKey = ApiEndpoint<{
    Audit: AuditPolicy<'api_key', 'updated', 'environment'>;
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

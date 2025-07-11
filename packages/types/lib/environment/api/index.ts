import type { ApiError, ApiTimestamps, Endpoint } from '../../api.js';
import type { ApiPlan } from '../../plans/http.api.js';
import type { DBEnvironment, DBExternalWebhook } from '../db.js';
import type { ApiEnvironmentVariable } from '../variable/api.js';
import type { Merge } from 'type-fest';

export type ApiEnvironment = Omit<
    Merge<DBEnvironment, { callback_url: string } & ApiTimestamps>,
    'secret_key_iv' | 'secret_key_tag' | 'secret_key_hashed' | 'pending_secret_key_iv' | 'pending_secret_key_tag' | 'pending_public_key'
>;
export type ApiWebhooks = Omit<DBExternalWebhook, 'id' | 'environment_id' | 'created_at' | 'updated_at'>;

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
        };
    };
}>;

export type PatchEnvironment = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/environments';
    Body: {
        name?: string | undefined;
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
    Error: ApiError<'conflict'>;
}>;

export type DeleteEnvironment = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/environments';
    Success: never;
    Error: ApiError<'cannot_delete_prod_environment'>;
}>;

import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../../api';
import type { DBEnvironment, DBExternalWebhook } from '../db';

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

export type PatchEnvironment = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/environments';
    Body: {
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
}>;

import type { Timestamps, TimestampsAndDeletedCorrect } from '../db';

export interface DBEnvironmentVariable extends Timestamps {
    id: number;
    name: string;
    value: string;
    environment_id: number;
    value_iv: string | null;
    value_tag: string | null;
}

export interface DBEnvironment extends TimestampsAndDeletedCorrect {
    id: number;
    uuid: string;
    name: string;
    account_id: number;
    secret_key: string;
    public_key: string;
    secret_key_iv?: string | null;
    secret_key_tag?: string | null;
    secret_key_hashed?: string | null;
    callback_url: string | null;
    /**
     * @deprecated
     */
    webhook_url: string | null;
    /**
     * @deprecated
     */
    webhook_url_secondary: string | null;
    websockets_path: string | null;
    hmac_enabled: boolean;
    always_send_webhook: boolean;
    send_auth_webhook: boolean;
    hmac_key: string | null;
    hmac_digest?: string | null;

    secret_key_rotatable?: boolean;
    public_key_rotatable?: boolean;

    pending_secret_key: string | null;
    pending_secret_key_iv?: string | null;
    pending_secret_key_tag?: string | null;
    pending_public_key?: string | null;
    slack_notifications: boolean;

    webhook_receive_url: string | null;
    otlp_settings: { endpoint: string; headers: Record<string, string> } | null;
}

export interface DBExternalWebhook extends Timestamps {
    id: number;
    environment_id: number;
    primary_url: string | null;
    secondary_url: string | null;
    on_sync_completion_always: boolean;
    on_auth_creation: boolean;
    on_auth_refresh_error: boolean;
    on_sync_error: boolean;
    on_async_action_completion: boolean;
}

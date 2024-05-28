import type { Timestamps } from './Generic.js';

export interface Environment extends Timestamps {
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
    webhook_url: string | null;
    webhook_url_secondary: string | null;
    websockets_path: string | null;
    hmac_enabled: boolean;
    always_send_webhook: boolean;
    send_auth_webhook: boolean;
    hmac_key: string | null;
    hmac_digest?: string | null;

    secret_key_rotatable?: boolean;
    public_key_rotatable?: boolean;

    pending_secret_key?: string | null;
    pending_secret_key_iv?: string | null;
    pending_secret_key_tag?: string | null;
    pending_public_key?: string | null;
    slack_notifications: boolean;

    webhook_receive_url?: string;
}

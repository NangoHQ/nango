import type { RetryHeaderConfig, CursorPagination, LinkPagination, OffsetPagination } from './Proxy.js';
import type { AuthModes } from './Auth.js';
import type { NangoConnection } from './Connection.js';
import type { HTTP_VERB, TimestampsAndDeleted } from './Generic.js';
import type { SyncConfig, Action } from './Sync.js';

export interface Config extends TimestampsAndDeleted {
    id?: number;
    unique_key: string;
    provider: string;
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes?: string;
    environment_id: number;
    oauth_client_secret_iv?: string | null;
    oauth_client_secret_tag?: string | null;
    app_link?: string | null;
    custom?: Record<string, string>;
}

export type TokenUrlObject = {
    [K in AuthModes]?: string;
};

export interface Template {
    auth_mode: AuthModes;
    proxy: {
        base_url: string;
        headers?: Record<string, string>;
        query?: {
            api_key: string;
        };
        retry?: RetryHeaderConfig;
        decompress?: boolean;
        paginate?: LinkPagination | CursorPagination | OffsetPagination;
        verification?: {
            method: HTTP_VERB;
            endpoint: string;
            base_url_override?: string;
            headers?: Record<string, string>;
        };
    };
    authorization_url: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;
    default_scopes?: string[];
    token_url: string | TokenUrlObject;
    token_params?: Record<string, string>;
    authorization_url_replacements?: Record<string, string>;
    redirect_uri_metadata?: string[];
    token_response_metadata?: string[];
    docs?: string;
    token_expiration_buffer?: number; // In seconds.
    webhook_routing_script?: string;
    webhook_user_defined_secret?: boolean;
    post_connection_script?: string;
    categories?: string[];
    connection_configuration?: string[];
}

export interface TemplateAlias {
    alias?: string;
    proxy: {
        base_url?: string;
    };
}

export interface IntegrationWithCreds extends Integration {
    client_id: string;
    client_secret: string;
    scopes: string;
    auth_mode: AuthModes;
    app_link?: string;
    has_webhook: boolean;
    webhook_url?: string;
    syncs: SyncConfig[];
    actions: Action[];
    created_at: Date;
    connections: NangoConnection[];
    docs: string;
    connection_count: number;
}

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: SyncConfig[];
    actions: Action[];
}

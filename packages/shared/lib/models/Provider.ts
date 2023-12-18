import type { CursorPagination, LinkPagination, OffsetPagination } from './Proxy.js';
import type { AuthModes } from './Auth.js';
import type { TimestampsAndDeleted } from './Generic.js';
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
}

export interface Template {
    auth_mode: AuthModes;
    proxy: {
        base_url: string;
        headers?: Record<string, string>;
        query?: {
            api_key: string;
        };
        retry?: {
            at?: string;
            after?: string;
        };
        decompress?: boolean;
        paginate?: LinkPagination | CursorPagination | OffsetPagination;
    };
    authorization_url: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;
    default_scopes?: string[];
    token_url: string;
    token_params?: {
        [key: string]: string;
    };
    redirect_uri_metadata?: Array<string>;
    token_response_metadata?: Array<string>;
    docs?: string;
    token_expiration_buffer?: number; // In seconds.
    webhook_routing_script?: string;
    post_connection_script?: string;
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
    syncs: SyncConfig[];
    actions: Action[];
}

export interface Integration {
    unique_key: string;
    provider: string;
    syncs: SyncConfig[];
    actions: Action[];
}

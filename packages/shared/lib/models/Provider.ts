import type { AuthModes } from './Auth.js';
import type { TimestampsAndDeleted } from './Generic.js';

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
}

export interface Integration {
    unique_key: string;
    provider: string;
}

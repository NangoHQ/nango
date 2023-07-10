import type { AuthModes } from './Auth.js';

export interface Config {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
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
    base_api_url?: string;
    docs?: string;
    token_expiration_buffer?: number; // In seconds.
}

export interface TemplateAlias {
    alias?: string;
    base_api_url?: string;
}

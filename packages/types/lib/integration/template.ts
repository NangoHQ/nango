import type { RetryHeaderConfig, CursorPagination, LinkPagination, OffsetPagination } from '../proxy/api.js';
import type { AuthModeType } from '../auth/api.js';
import type { EndpointMethod } from '../api.js';

export interface TokenUrlObject {
    OAuth1?: string;
    OAuth2?: string;
    OAuth2CC?: string;
    Basic?: string;
    ApiKey?: string;
    AppStore?: string;
    Custom?: string;
    App?: string;
    None?: string;
}

export interface Template {
    auth_mode: AuthModeType;
    proxy?: {
        base_url: string;
        headers?: Record<string, string>;
        query?: {
            api_key: string;
        };
        retry?: RetryHeaderConfig;
        decompress?: boolean;
        paginate?: LinkPagination | CursorPagination | OffsetPagination;
        verification?: {
            method: EndpointMethod;
            endpoint: string;
            base_url_override?: string;
            headers?: Record<string, string>;
        };
    };
    authorization_url?: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;
    default_scopes?: string[];
    token_url?: string | TokenUrlObject;
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

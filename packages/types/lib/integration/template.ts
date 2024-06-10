import type { RetryHeaderConfig, CursorPagination, LinkPagination, OffsetPagination } from '../proxy/api.js';
import type { AuthModeType, OAuthAuthorizationMethodType, OAuthBodyFormatType } from '../auth/api.js';
import type { EndpointMethod } from '../api.js';

export interface TokenUrlObject {
    OAUTH1?: string;
    OAUTH2?: string;
    OAUTH2CC?: string;
    BASIC?: string;
    API_KEY?: string;
    APP_STORE?: string;
    CUSTOM?: string;
    APP?: string;
    NONE?: string;
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

export interface TemplateOAuth2 extends Template {
    auth_mode: 'OAUTH2' | 'CUSTOM';

    disable_pkce?: boolean; // Defaults to false (=PKCE used) if not provided

    token_params?: {
        grant_type?: 'authorization_code' | 'client_credentials';
    };

    refresh_params?: {
        grant_type: 'refresh_token';
    };
    authorization_method?: OAuthAuthorizationMethodType;
    body_format?: OAuthBodyFormatType;

    refresh_url?: string;

    token_request_auth_method?: 'basic';
}

export interface TemplateOAuth1 extends Template {
    auth_mode: 'OAUTH1';

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

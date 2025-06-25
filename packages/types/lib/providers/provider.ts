import type { EndpointMethod } from '../api.js';
import type { AuthModeType, OAuthAuthorizationMethodType, OAuthBodyFormatType } from '../auth/api.js';
import type { CursorPagination, LinkPagination, OffsetPagination, RetryHeaderConfig } from '../proxy/api.js';

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

export interface ProviderAlias {
    alias?: string;
    proxy: {
        base_url?: string;
    };
}

export interface SimplifiedJSONSchema {
    type: 'string';
    title: string;
    description: string;
    example?: string;
    pattern?: string;
    optional?: boolean;
    format?: 'hostname' | 'uri' | 'uuid' | 'email';
    order: number;
    default_value?: string;
    hidden?: string;
    prefix?: string;
    suffix?: string;
    doc_section?: string;
    secret?: string;
    automated: boolean;
}

export interface BaseProvider {
    display_name: string;
    auth_mode: AuthModeType;
    proxy?: {
        base_url: string;
        headers?: Record<string, string>;
        connection_config?: Record<string, string>;
        query?: {
            api_key: string;
        };
        retry?: RetryHeaderConfig;
        decompress?: boolean;
        paginate?: LinkPagination | CursorPagination | OffsetPagination;
        verification?: {
            method: EndpointMethod;
            endpoints: string[];
            base_url_override?: string;
            headers?: Record<string, string>;
            data?: unknown;
        };
    };
    authorization_url?: string;
    authorization_url_skip_encode?: string[];
    authorization_url_skip_empty?: boolean;
    access_token_url?: string;
    authorization_params?: Record<string, string>;
    authorization_code_param_in_callback?: string;
    scope_separator?: string;
    default_scopes?: string[];
    token_url?: string | TokenUrlObject;
    token_url_skip_encode?: string[];
    token_params?: Record<string, string>;
    authorization_url_replacements?: Record<string, string>;
    redirect_uri_metadata?: string[];
    token_response_metadata?: string[];
    docs: string;
    docs_connect?: string;
    token_expiration_buffer?: number; // In seconds.
    webhook_routing_script?: string;
    webhook_user_defined_secret?: boolean;
    post_connection_script?: string;
    pre_connection_deletion_script?: string;
    credentials_verification_script?: string;
    categories?: string[];
    connection_configuration?: string[];
    connection_config?: Record<string, SimplifiedJSONSchema>;
    credentials?: Record<string, SimplifiedJSONSchema>;
    authorization_url_fragment?: string;
    body_format?: OAuthBodyFormatType;
    require_client_certificate?: boolean;
}

export interface ProviderOAuth2 extends BaseProvider {
    auth_mode: 'OAUTH2';

    disable_pkce?: boolean; // Defaults to false (=PKCE used) if not provided

    token_params?: {
        grant_type?: 'authorization_code' | 'client_credentials';
    };

    refresh_params?: {
        grant_type: 'refresh_token';
    };
    authorization_method?: OAuthAuthorizationMethodType;
    alternate_access_token_response_path?: string;

    refresh_url?: string;
    expires_in_unit?: 'milliseconds';

    token_request_auth_method?: 'basic' | 'custom';
}

export interface ProviderOAuth1 extends BaseProvider {
    auth_mode: 'OAUTH1';

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

// Github APP Oauth
export interface ProviderCustom extends Omit<ProviderOAuth2, 'auth_mode'> {
    auth_mode: 'CUSTOM';
    token_url: {
        OAUTH2: string;
        APP: string;
    };
}

export interface ProviderJwt extends BaseProvider {
    auth_mode: 'JWT';
    signature: {
        protocol: 'RSA' | 'HMAC';
    };
    token: {
        signing_key: string;
        expires_in_ms: number;
        header: {
            alg: string;
            typ?: string;
        };
        payload: {
            aud?: string;
            iss?: string;
            sub?: string;
        };
    };
}

export interface ProviderAppleAppStore extends BaseProvider {
    auth_mode: 'APP_STORE';
    token_url: string;
}

export interface ProviderBill extends BaseProvider {
    auth_mode: 'BILL';
}

export interface ProviderGithubApp extends BaseProvider {
    auth_mode: 'APP';
    token_url: string;
}

export interface ProviderTwoStep extends Omit<BaseProvider, 'body_format'> {
    auth_mode: 'TWO_STEP';
    token_request_method?: 'GET';
    token_headers?: Record<string, string>;
    token_response: {
        token: string;
        token_expiration: string;
        token_expiration_strategy: 'expireAt' | 'expireIn';
    };
    additional_steps?: {
        body_format?: 'json' | 'form';
        token_params?: Record<string, string>;
        token_headers?: Record<string, string>;
        token_url: string;
        token_request_method?: 'GET';
    }[];
    token_expires_in_ms?: number;
    proxy_header_authorization?: string;
    body_format?: 'xml' | 'json' | 'form';
}

export interface ProviderSignature extends BaseProvider {
    auth_mode: 'SIGNATURE';
    signature: {
        protocol: 'WSSE';
    };
    token: {
        expires_in_ms: number;
    };
}

export interface ProviderApiKey extends BaseProvider {
    auth_mode: 'API_KEY';
}

export type Provider =
    | BaseProvider
    | ProviderOAuth1
    | ProviderOAuth2
    | ProviderJwt
    | ProviderTwoStep
    | ProviderSignature
    | ProviderApiKey
    | ProviderBill
    | ProviderGithubApp
    | ProviderAppleAppStore
    | ProviderCustom;

export type RefreshableProvider = ProviderTwoStep | ProviderJwt | ProviderSignature | ProviderOAuth2; // TODO: fix this type
export type TestableProvider = ProviderApiKey; // TODO: fix this type

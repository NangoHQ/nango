import type { Endpoint } from '../api.js';
import type { AuthModeType } from '../auth/api.js';
import type { Provider, SimplifiedJSONSchema } from './provider.js';

export type GetPublicProviders = Endpoint<{
    Method: 'GET';
    Path: `/providers`;
    Querystring: { search?: string | undefined; connect_session_token?: string };
    Success: {
        data: ApiProvider[];
    };
}>;
export type ApiProvider = Provider & { name: string; logo_url: string };

export type GetPublicProvider = Endpoint<{
    Method: 'GET';
    Path: `/providers/:provider`;
    Params: { provider: string };
    Querystring?: { connect_session_token: string };
    Success: {
        data: ApiProvider;
    };
}>;

export interface ApiProviderListItem {
    name: string;
    displayName: string;
    defaultScopes?: string[] | undefined;
    availableScopes?: string[] | undefined;
    authMode: AuthModeType;
    categories?: string[] | undefined;
    docs: string;
    docs_connect?: string | undefined;
    preConfigured: boolean;
    preConfiguredScopes: string[];
    clientRegistration?: 'dynamic' | 'static' | 'metadata';
    integration_config?: Record<string, SimplifiedJSONSchema> | undefined;
}

export type GetProviders = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/providers';
    Success: {
        data: ApiProviderListItem[];
    };
}>;

export type GetProvider = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/providers/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: {
        data: ApiProviderListItem;
    };
}>;

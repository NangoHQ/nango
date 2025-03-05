import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { Provider } from '../providers/provider';
import type { AuthModeType, AuthModes } from '../auth/api';
import type { NangoSyncConfig } from '../flow';

export type ApiPublicIntegration = Merge<Pick<IntegrationConfig, 'created_at' | 'updated_at' | 'unique_key' | 'provider'>, ApiTimestamps> & {
    logo: string;
    display_name: string;
} & ApiPublicIntegrationInclude;
export interface ApiPublicIntegrationInclude {
    webhook_url?: string | null;
    credentials?:
        | { type: AuthModes['OAuth2'] | AuthModes['OAuth1'] | AuthModes['TBA']; client_id: string | null; client_secret: string | null; scopes: string | null }
        | { type: AuthModes['App']; app_id: string | null; private_key: string | null; app_link: string | null }
        | null;
}

export type GetPublicListIntegrationsLegacy = Endpoint<{
    Method: 'GET';
    Path: '/config';
    Success: {
        configs: ApiPublicIntegration[];
    };
}>;

export type GetPublicListIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/integrations';
    Querystring?: { connect_session_token: string };
    Success: {
        data: ApiPublicIntegration[];
    };
}>;

export type GetPublicIntegration = Endpoint<{
    Method: 'GET';
    Path: '/integrations/:uniqueKey';
    Params: { uniqueKey: string };
    Querystring: { include?: ('webhook' | 'credentials')[] | undefined };
    Success: { data: ApiPublicIntegration };
}>;

export type DeletePublicIntegration = Endpoint<{
    Method: 'DELETE';
    Path: '/config/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: { success: true };
}>;

export type ApiIntegration = Omit<Merge<IntegrationConfig, ApiTimestamps>, 'oauth_client_secret_iv' | 'oauth_client_secret_tag'>;

export type GetIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations';
    Success: {
        data: ApiIntegration[];
    };
}>;

export type PostIntegration = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/integrations';
    Querystring: { env: string };
    Body: { provider: string };
    Success: {
        data: ApiIntegration;
    };
}>;

export type GetIntegration = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Success: {
        data: {
            integration: ApiIntegration;
            template: Provider;
            meta: {
                connectionsCount: number;
                webhookUrl: string | null;
                webhookSecret: string | null;
            };
        };
    };
}>;

export type PatchIntegration = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/integrations/:providerConfigKey';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Body:
        | { integrationId?: string | undefined; webhookSecret?: string | undefined }
        | {
              authType: Extract<AuthModeType, 'OAUTH1' | 'OAUTH2' | 'TBA'>;
              clientId: string;
              clientSecret: string;
              scopes?: string | undefined;
          }
        | {
              authType: Extract<AuthModeType, 'APP'>;
              appId: string;
              appLink: string;
              privateKey: string;
          }
        | {
              authType: Extract<AuthModeType, 'CUSTOM'>;
              clientId: string;
              clientSecret: string;
              appId: string;
              appLink: string;
              privateKey: string;
          };
    Success: {
        data: {
            success: boolean;
        };
    };
}>;

export type DeleteIntegration = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/integrations/:providerConfigKey';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Success: {
        data: { success: boolean };
    };
}>;

export type GetIntegrationFlows = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey/flows';
    Querystring: { env: string };
    Params: { providerConfigKey: string };
    Success: {
        data: {
            flows: NangoSyncConfig[];
        };
    };
}>;

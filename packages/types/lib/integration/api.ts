import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { AuthModeType, AuthModes } from '../auth/api';
import type { NangoSyncConfig } from '../flow';
import type { Provider } from '../providers/provider';
import type { Merge } from 'type-fest';

export type ApiPublicIntegration = Merge<
    Pick<IntegrationConfig, 'created_at' | 'updated_at' | 'unique_key' | 'provider' | 'display_name' | 'forward_webhooks'>,
    ApiTimestamps
> & {
    logo: string;
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

export type PostPublicIntegration = Endpoint<{
    Method: 'POST';
    Path: '/integrations';
    Body: {
        provider: string;
        unique_key: string;
        display_name?: string | undefined;
        credentials?: ApiPublicIntegrationCredentials | undefined;
        forward_webhooks?: boolean | undefined;
    };
    Success: {
        data: ApiPublicIntegration;
    };
}>;

export type GetPublicIntegration = Endpoint<{
    Method: 'GET';
    Path: '/integrations/:uniqueKey';
    Params: { uniqueKey: string };
    Querystring: { include?: ('webhook' | 'credentials')[] | undefined };
    Success: { data: ApiPublicIntegration };
}>;

export type PatchPublicIntegration = Endpoint<{
    Method: 'PATCH';
    Path: '/integrations/:uniqueKey';
    Params: { uniqueKey: string };
    Body: {
        unique_key?: string | undefined;
        display_name?: string | undefined;
        credentials?: ApiPublicIntegrationCredentials | undefined;
        forward_webhooks?: boolean | undefined;
    };
    Success: {
        data: ApiPublicIntegration;
    };
}>;

export type DeletePublicIntegration = Endpoint<{
    Method: 'DELETE';
    Path: '/integrations/:uniqueKey';
    Params: { uniqueKey: string };
    Success: { success: true };
}>;

export type DeletePublicIntegrationDeprecated = Endpoint<{
    Method: 'DELETE';
    Path: '/config/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: { success: true };
}>;

export type ApiIntegration = Omit<Merge<IntegrationConfig, ApiTimestamps>, 'oauth_client_secret_iv' | 'oauth_client_secret_tag'>;
export type ApiIntegrationList = ApiIntegration & {
    meta: {
        authMode: AuthModeType;
        scriptsCount: number;
        connectionCount: number;
        creationDate: string;
        missingFieldsCount: number;
        connectionConfigParams?: string[];
        credentialParams?: string[];
        displayName: string;
        requireClientCertificate?: boolean;
    };
};

export type GetIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations';
    Success: {
        data: ApiIntegrationList[];
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
        | { integrationId?: string | undefined; webhookSecret?: string | undefined; displayName?: string | undefined; forward_webhooks?: boolean | undefined }
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

export type ApiPublicIntegrationCredentials =
    | {
          type: Extract<AuthModeType, 'OAUTH1' | 'OAUTH2' | 'TBA'>;
          client_id: string;
          client_secret: string;
          scopes?: string | undefined;
      }
    | {
          type: Extract<AuthModeType, 'APP'>;
          app_id: string;
          app_link: string;
          private_key: string;
      }
    | {
          type: Extract<AuthModeType, 'CUSTOM'>;
          client_id: string;
          client_secret: string;
          app_id: string;
          app_link: string;
          private_key: string;
      };

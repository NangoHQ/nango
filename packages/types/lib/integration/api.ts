import type { ApiError, ApiTimestamps, Endpoint } from '../api.js';
import type { IntegrationConfig } from './db.js';
import type { AuthModeType, AuthModes } from '../auth/api.js';
import type { NangoSyncConfig } from '../flow/index.js';
import type { Provider } from '../providers/provider.js';
import type { Merge } from 'type-fest';

export interface AwsSigV4TemplateSummary {
    id: string;
    label?: string;
    description?: string;
    stack_name?: string;
    template_url?: string;
    template_body?: string;
    parameters?: Record<string, string>;
}

export type ApiPublicIntegration = Merge<
    Pick<IntegrationConfig, 'created_at' | 'updated_at' | 'unique_key' | 'provider' | 'display_name' | 'forward_webhooks'>,
    ApiTimestamps
> & {
    logo: string;
    aws_sigv4?:
        | {
              instructions?: {
                  label?: string;
                  url?: string;
                  description?: string;
              };
              templates?: AwsSigV4TemplateSummary[];
          }
        | undefined;
} & ApiPublicIntegrationInclude;
export interface ApiPublicIntegrationInclude {
    webhook_url?: string | null;
    credentials?:
        | {
              type: AuthModes['OAuth2'] | AuthModes['OAuth1'] | AuthModes['TBA'];
              client_id: string | null;
              client_secret: string | null;
              scopes: string | null;
              webhook_secret: string | null;
          }
        | { type: AuthModes['App']; app_id: string | null; private_key: string | null; app_link: string | null }
        | null;
}

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
        assertionOptionParams?: string[];
        authorizationParams?: Record<string, string>;
        displayName: string;
        requireClientCertificate?: boolean;
        installation?: 'outbound';
    };
};

export type GetIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations';
    Success: {
        data: ApiIntegrationList[];
    };
}>;

export interface OAuthAuthBody {
    authType: Extract<AuthModeType, 'OAUTH1' | 'OAUTH2' | 'TBA'>;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    scopes?: string | undefined;
}

export interface AppAuthBody {
    authType: Extract<AuthModeType, 'APP'>;
    appId?: string | undefined;
    appLink?: string | undefined;
    privateKey?: string | undefined;
}

export interface CustomAuthBody {
    authType: Extract<AuthModeType, 'CUSTOM'>;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    appId?: string | undefined;
    appLink?: string | undefined;
    privateKey?: string | undefined;
}

export interface MCPOAuth2AuthBody {
    authType: Extract<AuthModeType, 'MCP_OAUTH2'>;
    scopes?: string | undefined;
}

export interface MCPOAuth2GenericAuthBody {
    authType: Extract<AuthModeType, 'MCP_OAUTH2_GENERIC'>;
    clientName?: string | undefined;
    clientUri?: string | undefined;
    clientLogoUri?: string | undefined;
}

export interface InstallPluginAuthBody {
    authType: Extract<AuthModeType, 'INSTALL_PLUGIN'>;
    appLink?: string | undefined;
    username?: string | undefined;
    password?: string | undefined;
}

export type IntegrationAuthBody = OAuthAuthBody | AppAuthBody | CustomAuthBody | MCPOAuth2AuthBody | MCPOAuth2GenericAuthBody | InstallPluginAuthBody;

export type PostIntegration = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/integrations';
    Querystring: { env: string };
    Body: {
        provider: string;
        useSharedCredentials: boolean;
        integrationId?: string | undefined;
        webhookSecret?: string | undefined;
        displayName?: string | undefined;
        forward_webhooks?: boolean | undefined;
        auth?: IntegrationAuthBody | undefined;
    };
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
        | { custom: Record<string, string | null> }
        | IntegrationAuthBody;
    Error:
        | ApiError<'missing_aws_sigv4_config'>
        | ApiError<'invalid_aws_sigv4_config'>
        | ApiError<'missing_aws_sigv4_service'>
        | ApiError<'missing_aws_sigv4_sts_endpoint'>;
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
          webhook_secret?: string | undefined;
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

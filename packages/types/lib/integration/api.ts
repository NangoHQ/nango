import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { Provider } from '../providers/provider';
import type { AuthModeType } from '../auth/api';
import type { NangoModel, NangoSyncEndpointV2, ScriptTypeLiteral } from '../nangoYaml';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { JSONSchema7 } from 'json-schema';
import type { SyncType } from '../scripts/syncs/api';

export type ApiPublicIntegration = Merge<Pick<IntegrationConfig, 'created_at' | 'updated_at' | 'unique_key' | 'provider'>, ApiTimestamps> & {
    logo: string;
    display_name: string;
} & ApiPublicIntegrationInclude;
export interface ApiPublicIntegrationInclude {
    webhook_url?: string | null;
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
    Success: {
        data: ApiPublicIntegration[];
    };
}>;

export type GetPublicIntegration = Endpoint<{
    Method: 'GET';
    Path: '/integrations/:uniqueKey';
    Params: { uniqueKey: string };
    Querystring: { include?: 'webhook'[] | undefined };
    Success: { data: ApiPublicIntegration };
}>;

export type DeletePublicIntegration = Endpoint<{
    Method: 'DELETE';
    Path: '/config/:providerConfigKey';
    Params: { providerConfigKey: string };
    Success: { success: true };
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

export type ApiIntegration = Omit<Merge<IntegrationConfig, ApiTimestamps>, 'oauth_client_secret_iv' | 'oauth_client_secret_tag'>;
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
            missingFields: string[];
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

// Todo: Move this type elsewhere?
export interface NangoSyncConfig {
    name: string;
    type?: ScriptTypeLiteral;
    runs: string;
    auto_start?: boolean;
    attributes?: object;
    description?: string;
    scopes?: string[];
    metadata?: NangoConfigMetadata;
    track_deletes?: boolean;
    returns: string[] | string;
    models: any[];
    endpoints: NangoSyncEndpointV2[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: NangoModel | LegacySyncModelSchema;
    sync_type?: SyncType;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: string;
}

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

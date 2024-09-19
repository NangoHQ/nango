import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { Provider } from '../providers/provider';
import type { AuthModeType } from '../auth/api';
import type { NangoModel, NangoSyncEndpoint, ScriptTypeLiteral } from '../nangoYaml';
import type { LegacySyncModelSchema, NangoConfigMetadata } from '../deploy/incomingFlow';
import type { JSONSchema7 } from 'json-schema';
import type { SyncType } from '../scripts/syncs/api';

export type ApiPublicIntegration = Merge<Pick<IntegrationConfig, 'created_at' | 'updated_at' | 'unique_key' | 'provider'>, ApiTimestamps> & {
    logo: string;
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
    Querystring: { include?: ('credentials' | 'webhook')[] | undefined };
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
    Body: { provider: string };
    Success: {
        data: ApiIntegration;
    };
}>;

export type ApiIntegration = Merge<IntegrationConfig, ApiTimestamps>;
export type GetIntegration = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey';
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
    Params: { providerConfigKey: string };
    Body:
        | { integrationId?: string | undefined }
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
    endpoints: NangoSyncEndpoint[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: NangoModel | LegacySyncModelSchema;
    sync_type?: SyncType;
    nango_yaml_version?: string;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: string;
}

export type GetIntegrationFlows = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/integrations/:providerConfigKey/flows';
    Params: { providerConfigKey: string };
    Success: {
        data: {
            flows: NangoSyncConfig[];
        };
    };
}>;

import type { Merge } from 'type-fest';
import type { ApiTimestamps, Endpoint } from '../api';
import type { IntegrationConfig } from './db';
import type { Template } from './template';
import type { AuthModeType } from '../auth/api';
import type { NangoSyncEndpoint, ScriptTypeLiteral } from '../nangoYaml';
import type { NangoConfigMetadata } from '../deploy/incomingFlow';
import type { JSONSchema7 } from 'json-schema';
import type { SyncType } from '../scripts/syncs/api';

export type GetListIntegrations = Endpoint<{
    Method: 'GET';
    Path: '/config';
    Success: {
        configs: {
            provider: string;
            unique_key: string;
        }[];
    };
}>;
export type DeleteIntegrationPublic = Endpoint<{
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
            template: Template;
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
    returns: string[];
    models: any[];
    endpoints: NangoSyncEndpoint[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;
    input?: any;
    sync_type?: SyncType;
    nango_yaml_version?: string;
    webhookSubscriptions?: string[];
    enabled?: boolean;
    json_schema: JSONSchema7 | null;
    upgrade_version?: boolean;
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

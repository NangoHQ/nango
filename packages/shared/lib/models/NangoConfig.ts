/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { HTTP_VERB } from './Generic.js';
import type { SyncType, SyncConfigType, NangoConfigMetadata } from './Sync.js';

export interface NangoIntegrationDataV1 {
    type?: SyncConfigType;
    runs: string;
    returns: string[];
    input?: string;
    track_deletes?: boolean;
    auto_start?: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    fileLocation?: string;
    version?: string;
    sync_config_id?: number;
    pre_built?: boolean;
    is_public?: boolean;
    endpoint?: string | string[];
    nango_yaml_version?: string;
    enabled?: boolean;
}

export interface NangoIntegrationDataV2 extends NangoIntegrationDataV1 {
    sync_type?: SyncType;
    description?: string;
    updated_at?: string;
    'webhook-subscriptions'?: string[];
    scopes?: string[];
    output?: string | string[];
    id?: number;
}

export interface NangoIntegrationV1 {
    // providerConfigKey
    [key: string]: {
        // flow name
        [key: string]: NangoIntegrationDataV1;
    };
}

export interface NangoV2IntegrationContents {
    provider?: string;
    syncs?: NangoIntegrationDataV2[];
    actions?: NangoIntegrationDataV2[];
    'post-connection-scripts'?: string[];
}

export interface NangoV2Integration {
    // providerConfigKey
    [key: string]: NangoV2IntegrationContents;
}

export interface NangoModelV1 {
    // modelName
    [key: string]: {
        // field name
        [key: string]: string | Record<string, string>;
    };
}

export interface ModelSchema {
    [key: string]: {
        description?: string;
        type: string | Record<string, string>;
    };
}

interface Extends {
    __extends: string;
}

export interface NangoModelV2Contents {
    description?: string;
    schema: ModelSchema | Extends;
}

export interface NangoModelV2 {
    [key: string]: NangoModelV2Contents;
}

export interface NangoConfigV1 {
    integrations: NangoIntegrationV1;
    models: NangoModelV1;
}

export interface NangoConfigV2 {
    integrations: NangoV2Integration;
    models: NangoModelV1;
}

export type NangoConfig = NangoConfigV1 | NangoConfigV2;
export type NangoModel = NangoModelV1;
export type NangoIntegrationData = NangoIntegrationDataV1 | NangoIntegrationDataV2;
export type NangoIntegration = NangoIntegrationV1 | NangoV2Integration;

export interface NangoSyncModelField {
    name: string;
    type: string;
}

export interface NangoSyncModel {
    name: string;
    description?: string;
    fields: NangoSyncModelField[];
}

export type NangoSyncEndpoint = {
    [key in HTTP_VERB]?: string;
};

export type LayoutMode = 'root' | 'nested';

export interface NangoSyncConfig {
    name: string;
    type?: SyncConfigType;
    runs: string;
    auto_start?: boolean;
    attributes?: object;
    description?: string;
    scopes?: string[];
    metadata?: NangoConfigMetadata;
    track_deletes?: boolean;
    returns: string[];
    models: NangoSyncModel[];
    endpoints: NangoSyncEndpoint[];
    is_public?: boolean | null;
    pre_built?: boolean | null;
    version?: string | null;
    last_deployed?: string | null;
    id?: number;

    // v2 additions
    input?: NangoSyncModel;
    sync_type?: SyncType;
    nango_yaml_version?: string;
    webhookSubscriptions?: string[];
    enabled?: boolean;

    layout_mode: LayoutMode;
}

export interface StandardNangoConfig {
    providerConfigKey: string;
    rawName?: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
    postConnectionScripts?: string[];
}

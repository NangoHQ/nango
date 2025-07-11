/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { SyncJobsType } from './Sync.js';
import type { NangoConfigMetadata, NangoSyncEndpointV2, ScriptTypeLiteral } from '@nangohq/types';

export interface NangoIntegrationDataV1 {
    type?: ScriptTypeLiteral;
    runs: string | null;
    returns: string[];
    input?: string | null;
    track_deletes?: boolean;
    auto_start?: boolean | undefined;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    fileLocation?: string;
    version?: string;
    sync_config_id?: number;
    pre_built?: boolean;
    is_public?: boolean;
    endpoint?: NangoSyncEndpointV2 | NangoSyncEndpointV2[];
    enabled?: boolean;
}

export interface NangoIntegrationDataV2 extends NangoIntegrationDataV1 {
    sync_type?: SyncJobsType;
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

// TODO: drop all V1 interface (except NangoModelV1 that can still exists in DB)
export type NangoConfig = NangoConfigV1 | NangoConfigV2;
export type NangoModel = NangoModelV1;
export type NangoIntegrationData = NangoIntegrationDataV1 | NangoIntegrationDataV2;
export type NangoIntegration = NangoIntegrationV1 | NangoV2Integration;

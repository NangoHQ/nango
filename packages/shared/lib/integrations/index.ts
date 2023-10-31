import type { HTTP_VERB } from '../models/Generic.js';
import type { SyncConfigType, NangoConfigMetadata } from '../models/Sync.js';

export * as HubspotModels from './Hubspot.js';
export * as GithubModels from './Github.js';

export interface NangoIntegrationData {
    type?: SyncConfigType;
    runs: string;
    returns: string[];
    inputs?: string[];
    track_deletes?: boolean;
    auto_start?: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    fileLocation?: string;
    version?: string;
    sync_config_id?: number;
    pre_built?: boolean;
    is_public?: boolean;
    endpoints?: NangoSyncEndpoint[];
}
export interface NangoIntegration {
    [key: string]: {
        // providerConfigKey
        [key: string]: NangoIntegrationData;
    };
}

export interface NangoModel {
    [key: string]: {
        // modelName
        [key: string]: string | Record<string, string>;
    };
}

export interface NangoConfig {
    integrations: NangoIntegration;
    models: NangoModel;
}

interface NangoSyncModelField {
    name: string;
    type: string;
}

export interface NangoSyncModel {
    name: string;
    fields: NangoSyncModelField[];
}

export type NangoSyncEndpoint = {
    [key in HTTP_VERB]: string;
};

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
}

export interface SimplifiedNangoIntegration {
    providerConfigKey: string;
    provider?: string;
    syncs: NangoSyncConfig[];
    actions: NangoSyncConfig[];
}

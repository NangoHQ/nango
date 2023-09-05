import type { SyncConfigType } from '../models/Sync.js';

export * as HubspotModels from './Hubspot.js';
export * as GithubModels from './Github.js';

export interface NangoIntegrationData {
    type?: SyncConfigType;
    runs: string;
    returns: string[];
    fileLocation?: string;
    version?: string;
    sync_config_id?: number;
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
    fields: NangoSyncModelField[][];
}

export interface NangoSyncConfig {
    name: string;
    type?: SyncConfigType;
    runs: string;
    returns: string[];
    models: NangoSyncModel[];
}

export interface SimplifiedNangoIntegration {
    providerConfigKey: string;
    syncs: NangoSyncConfig[];
}

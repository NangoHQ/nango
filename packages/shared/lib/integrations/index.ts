export * as HubspotModels from './hubspot.js';

export interface NangoIntegrationData {
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
    runs: string;
    cronExpression?: string;
    returns: string[];
    models: NangoSyncModel[];
}

export interface SimplifiedNangoIntegration {
    providerConfigKey: string;
    syncs: NangoSyncConfig[];
}

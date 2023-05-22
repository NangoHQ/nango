import type { Nango } from '../sdk.js';
export * as HubspotModels from './hubspot.js';

export abstract class NangoSync {
    fetchData?(nango: Nango): Promise<any>;
    postData?(nango: Nango): Promise<any>;
    patchData?(nango: Nango): Promise<any>;
    putData?(nango: Nango): Promise<any>;
    deleteData?(nango: Nango): Promise<any>;
}

export interface NangoIntegrationData {
    runs: string;
    returns: string[];
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

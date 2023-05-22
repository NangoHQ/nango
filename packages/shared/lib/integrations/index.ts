import type { Nango } from '../sdk.js';

export abstract class NangoSync {
    abstract fetchData(nango: Nango): Promise<any>;
    abstract postData(nango: Nango): Promise<any>;
    abstract patchData(nango: Nango): Promise<any>;
    abstract putData(nango: Nango): Promise<any>;
    abstract deleteData(nango: Nango): Promise<any>;
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

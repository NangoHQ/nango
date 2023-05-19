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

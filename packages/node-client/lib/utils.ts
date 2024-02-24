import type { ProxyConfiguration, GetRecordsRequestConfig } from './types.js';

export const validateProxyConfiguration = (config: ProxyConfiguration) => {
    const requiredParams: (keyof ProxyConfiguration)[] = ['endpoint', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

export const validateSyncRecordConfiguration = (config: GetRecordsRequestConfig) => {
    const requiredParams: (keyof GetRecordsRequestConfig)[] = ['model', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

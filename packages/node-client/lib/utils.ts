import type { ProxyConfiguration } from './types';

export const validateProxyConfiguration = (config: ProxyConfiguration) => {
    const requiredParams = ['endpoint', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

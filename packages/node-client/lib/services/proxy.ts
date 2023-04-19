import type { ProxyConfiguration } from '../types';

export class ProxyService {
    public validateConfiguration(config: ProxyConfiguration) {
        const requiredParams = ['endpoint', 'providerConfigKey', 'connectionId'];

        requiredParams.forEach((param) => {
            if (typeof config[param] === 'undefined') {
                throw new Error(`${param} is missing and is required to make a proxy call!`);
            }
        });
    }

    public run(tokenResponse: unknown, config: ProxyConfiguration) {
        console.log(tokenResponse, config);
    }
}

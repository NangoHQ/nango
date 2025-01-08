import os from 'os';

import type { ProxyConfiguration, ListRecordsRequestConfig } from './types.js';
import { NANGO_VERSION } from './version.js';

/**
 * Validates the configuration for a proxy call
 * @param config - Configuration object for the proxy call
 * @throws If required parameters are missing in the configuration
 */
export const validateProxyConfiguration = (config: ProxyConfiguration) => {
    const requiredParams: (keyof ProxyConfiguration)[] = ['endpoint', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

/**
 * Validates the configuration for fetching sync records
 * @param config - Configuration object for fetching sync records
 * @throws If required parameters are missing in the configuration
 */
export const validateSyncRecordConfiguration = (config: ListRecordsRequestConfig) => {
    const requiredParams: (keyof ListRecordsRequestConfig)[] = ['model', 'providerConfigKey', 'connectionId'];

    requiredParams.forEach((param) => {
        if (typeof config[param] === 'undefined') {
            throw new Error(`${param} is missing and is required to make a proxy call!`);
        }
    });
};

export function getUserAgent(userAgent?: string): string {
    const nodeVersion = process.versions.node;

    const osName = os.platform().replace(' ', '_');
    const osVersion = os.release().replace(' ', '_');
    return `nango-node-client/${NANGO_VERSION} (${osName}/${osVersion}; node.js/${nodeVersion})${userAgent ? `; ${userAgent}` : ''}`;
}

export function addQueryParams(url: URL, queries?: Record<string, any>) {
    if (!queries) {
        return;
    }

    Object.entries(queries).forEach(([name, value]) => {
        if (Array.isArray(value)) {
            for (const el of value) {
                url.searchParams.set(name, el);
            }
        } else if (value !== null && value !== undefined) {
            url.searchParams.set(name, value);
        }
    });
}

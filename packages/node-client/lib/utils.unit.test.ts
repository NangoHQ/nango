import { describe, expect, it } from 'vitest';

import { addQueryParams, getUserAgent, validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

import type { ListRecordsRequestConfig, ProxyConfiguration } from './types.js';

const regex = /^nango-node-client\/[0-9.]+ \([a-z0-9_]+\/[0-9a-zA-Z._-]+; node\.js\/[0-9.]+\)$/;
describe('getUserAgent', () => {
    it('should output default user agent', () => {
        expect(getUserAgent()).toMatch(regex);
    });
    it('should output additional user agent ', () => {
        expect(getUserAgent('cli')).toMatch(/^nango-node-client\/[0-9.]+ \([a-z0-9_]+\/[0-9a-zA-Z._-]+; node\.js\/[0-9.]+\); cli$/);
    });
});

describe('validateProxyConfiguration', () => {
    it('should not throw when all required parameters are provided', () => {
        const config: ProxyConfiguration = {
            endpoint: '/users',
            providerConfigKey: 'github',
            connectionId: 'conn-123'
        };
        expect(() => validateProxyConfiguration(config)).not.toThrow();
    });

    it('should throw an informative error when a required parameter is missing', () => {
        const config = {
            providerConfigKey: 'github',
            connectionId: 'conn-123'
        } as ProxyConfiguration;
        expect(() => validateProxyConfiguration(config)).toThrow('endpoint is missing and is required to make a proxy call!');
    });
});

describe('validateSyncRecordConfiguration', () => {
    it('should not throw when all required parameters are provided', () => {
        const config: ListRecordsRequestConfig = {
            model: 'Contact',
            providerConfigKey: 'hubspot',
            connectionId: 'conn-456'
        };
        expect(() => validateSyncRecordConfiguration(config)).not.toThrow();
    });

    it('should throw an informative error when a required parameter is missing', () => {
        const config = {
            providerConfigKey: 'hubspot',
            connectionId: 'conn-456'
        } as ListRecordsRequestConfig;
        expect(() => validateSyncRecordConfiguration(config)).toThrow('model is missing and is required to fetch sync records!');
    });
});

describe('addQueryParams', () => {
    it('should correctly append scalar and array query parameters', () => {
        const url = new URL('https://api.example.com/data');
        addQueryParams(url, {
            filter: 'active',
            tags: ['tag1', 'tag2'],
            empty: undefined,
            nullValue: null
        });

        expect(url.searchParams.get('filter')).toBe('active');
        expect(url.searchParams.getAll('tags')).toEqual(['tag1', 'tag2']);
        expect(url.searchParams.has('empty')).toBe(false);
        expect(url.searchParams.has('nullValue')).toBe(false);
    });

    it('should do nothing when queries is undefined', () => {
        const url = new URL('https://api.example.com/data');
        addQueryParams(url, undefined);
        expect(url.search).toBe('');
    });
});

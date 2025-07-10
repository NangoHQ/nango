import { describe, expect, it } from 'vitest';

import { ENVS, parseEnvs } from './parse.js';

describe('parse', () => {
    it('should parse correctly', () => {
        const res = parseEnvs(ENVS.required({ NANGO_DATABASE_URL: true }), { NANGO_DATABASE_URL: 'http://example.com' });
        expect(res).toMatchObject({ NANGO_DATABASE_URL: 'http://example.com' });
    });

    it('should throw on error', () => {
        expect(() => {
            parseEnvs(ENVS.required({ NANGO_DATABASE_URL: true }), {});
        }).toThrowError();
    });

    it('should have some default', () => {
        const res = parseEnvs(ENVS, {});
        expect(res).toMatchObject({ NANGO_DB_SSL: false, NANGO_PERSIST_PORT: 3007 });
    });

    it('should coerce boolean and number', () => {
        const res = parseEnvs(ENVS, { NANGO_DB_SSL: 'true', NANGO_LOGS_ENABLED: 'false', NANGO_PERSIST_PORT: '3008', NANGO_CACHE_ENV_KEYS: '' });
        expect(res).toMatchObject({ NANGO_DB_SSL: true, NANGO_PERSIST_PORT: 3008, NANGO_LOGS_ENABLED: false, NANGO_CLOUD: false, NANGO_CACHE_ENV_KEYS: false });
    });
});

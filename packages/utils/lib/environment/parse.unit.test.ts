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
        const res = parseEnvs(ENVS, { NANGO_DB_SSL: 'true', NANGO_LOGS_ENABLED: 'false', NANGO_PERSIST_PORT: '3008' });
        expect(res).toMatchObject({ NANGO_DB_SSL: true, NANGO_PERSIST_PORT: 3008, NANGO_LOGS_ENABLED: false, NANGO_CLOUD: false, NANGO_CACHE_ENV_KEYS: false });
    });

    it('should throw on invalid JSON', () => {
        expect(() => {
            parseEnvs(ENVS, { JOB_PROCESSOR_CONFIG: 'invalid' });
        }).toThrow('Invalid JSON in JOBS_PROCESSOR_CONFIG');
    });

    it('should parse JOBS_PROCESSOR_CONFIG', () => {
        const res = parseEnvs(ENVS, {
            JOBS_PROCESSOR_CONFIG:
                '[{"groupKeyPattern":"sync","maxConcurrency":200},{"groupKeyPattern":"action","maxConcurrency":200},{"groupKeyPattern":"webhook","maxConcurrency":200},{"groupKeyPattern":"on-event","maxConcurrency":50}]'
        });
        expect(res).toMatchObject({
            JOBS_PROCESSOR_CONFIG: [
                { groupKeyPattern: 'sync', maxConcurrency: 200 },
                { groupKeyPattern: 'action', maxConcurrency: 200 },
                { groupKeyPattern: 'webhook', maxConcurrency: 200 },
                { groupKeyPattern: 'on-event', maxConcurrency: 50 }
            ]
        });
    });
});

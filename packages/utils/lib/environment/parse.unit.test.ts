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
            parseEnvs(ENVS, { JOBS_PROCESSOR_CONFIG: 'invalid' });
        }).toThrow('Invalid JSON in JOBS_PROCESSOR_CONFIG');
    });

    it('should throw on invalid JSON in NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        expect(() => {
            parseEnvs(ENVS, { NANGO_PUBSUB_SNS_SQS_CONFIG: 'not-json' });
        }).toThrow('Invalid JSON in NANGO_PUBSUB_SNS_SQS_CONFIG');
    });

    it('should throw on invalid topicArns keys in NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        expect(() => {
            parseEnvs(ENVS, {
                NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({
                    topicArns: { usage: 'arn:x', invalid: 'arn:y' },
                    queueUrls: {}
                })
            });
        }).toThrow();
    });

    it('should throw on invalid queueUrls keys in NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        expect(() => {
            parseEnvs(ENVS, {
                NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({
                    topicArns: {},
                    queueUrls: { 'workers:usage': 'https://sqs.example/1', 'no-subject-segment': 'https://sqs.example/2' }
                })
            });
        }).toThrow();
    });

    it('should throw when queueUrls subject suffix is not user|usage|team', () => {
        expect(() => {
            parseEnvs(ENVS, {
                NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({
                    topicArns: {},
                    queueUrls: { 'workers:other': 'https://sqs.example/1' }
                })
            });
        }).toThrow();
    });

    it('should parse valid NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        const topicArns = { usage: 'arn:aws:sns:us-east-1:123456789012:usage-events' };
        const queueUrls = { 'default:usage': 'https://sqs.us-east-1.amazonaws.com/123456789012/usage-queue' };
        const res = parseEnvs(ENVS, {
            NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({ topicArns, queueUrls })
        });
        expect(res.NANGO_PUBSUB_SNS_SQS_CONFIG).toEqual({ topicArns, queueUrls });
    });

    it('should throw on invalid SNS topic ARN value in NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        expect(() => {
            parseEnvs(ENVS, {
                NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({
                    topicArns: { usage: 'arn:aws:sns:us-east-1:1234:too-short-account:topic' },
                    queueUrls: {}
                })
            });
        }).toThrow();
    });

    it('should throw on invalid queue URL value in NANGO_PUBSUB_SNS_SQS_CONFIG', () => {
        expect(() => {
            parseEnvs(ENVS, {
                NANGO_PUBSUB_SNS_SQS_CONFIG: JSON.stringify({
                    topicArns: {},
                    queueUrls: { 'default:usage': 'not-a-url' }
                })
            });
        }).toThrow();
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

    it('should default NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST to empty array', () => {
        const res = parseEnvs(ENVS, {});
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([]);
    });

    it('should parse NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST JSON array and trim entries', () => {
        const res = parseEnvs(ENVS, {
            NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: JSON.stringify([' 169.254.169.254 ', 'localhost', ''])
        });
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual(['169.254.169.254', 'localhost']);
    });

    it('should throw on invalid NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST JSON', () => {
        expect(() => {
            parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: 'not-json' });
        }).toThrow('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST');
    });

    it('should throw when NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST is not a string array', () => {
        expect(() => {
            parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: JSON.stringify([1, 2]) });
        }).toThrow('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST');
    });
});

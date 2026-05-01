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

    it('should parse the sandbox compiler template', () => {
        const res = parseEnvs(ENVS, { E2B_SANDBOX_COMPILER_TEMPLATE: 'blank-workspace:dev' });
        expect(res.E2B_SANDBOX_COMPILER_TEMPLATE).toBe('blank-workspace:dev');
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

    describe('WEBHOOK_INGRESS_USE_DISPATCH_QUEUE', () => {
        it('should default to false', () => {
            const res = parseEnvs(ENVS, {});
            expect(res.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE).toBe(false);
        });

        it('should coerce "true"/"false" strings', () => {
            expect(parseEnvs(ENVS, { WEBHOOK_INGRESS_USE_DISPATCH_QUEUE: 'true' }).WEBHOOK_INGRESS_USE_DISPATCH_QUEUE).toBe(true);
            expect(parseEnvs(ENVS, { WEBHOOK_INGRESS_USE_DISPATCH_QUEUE: 'false' }).WEBHOOK_INGRESS_USE_DISPATCH_QUEUE).toBe(false);
        });
    });

    describe('NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN', () => {
        it('should default to 4000', () => {
            const res = parseEnvs(ENVS, {});
            expect(res.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN).toBe(4000);
        });

        it('should accept 0 (disabled)', () => {
            const res = parseEnvs(ENVS, { NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN: '0' });
            expect(res.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN).toBe(0);
        });

        it('should accept positive overrides', () => {
            const res = parseEnvs(ENVS, { NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN: '120' });
            expect(res.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN).toBe(120);
        });

        it('should reject negatives', () => {
            expect(() => {
                parseEnvs(ENVS, { NANGO_WEBHOOK_INGRESS_RATE_LIMIT_PER_MIN: '-1' });
            }).toThrowError();
        });
    });

    describe('NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE', () => {
        it('should default to false', () => {
            const res = parseEnvs(ENVS, {});
            expect(res.NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE).toBe(false);
        });

        it('should coerce "true"/"false" strings', () => {
            expect(parseEnvs(ENVS, { NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE: 'true' }).NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE).toBe(true);
            expect(parseEnvs(ENVS, { NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE: 'false' }).NANGO_WEBHOOK_INGRESS_RATE_LIMIT_ENFORCE).toBe(false);
        });
    });

    describe('NANGO_TASK_DISPATCH_*', () => {
        it('should apply defaults when task-dispatch vars are absent', () => {
            const res = parseEnvs(ENVS, {});
            expect(res).toMatchObject({
                NANGO_TASK_DISPATCH_MAX_MESSAGES: 10,
                NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS: 20,
                NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS: 30,
                NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY: 50,
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: 10,
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: 10
            });
            expect(res.NANGO_TASK_DISPATCH_QUEUE_URL).toBeUndefined();
            expect(res.NANGO_TASK_DISPATCH_DLQ_URL).toBeUndefined();
        });

        it('should accept valid SQS URLs for queue and DLQ', () => {
            const res = parseEnvs(ENVS, {
                NANGO_TASK_DISPATCH_QUEUE_URL: 'https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-development',
                NANGO_TASK_DISPATCH_DLQ_URL: 'https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-dlq-development'
            });
            expect(res.NANGO_TASK_DISPATCH_QUEUE_URL).toBe('https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-development');
            expect(res.NANGO_TASK_DISPATCH_DLQ_URL).toBe('https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-dlq-development');
        });

        it('should throw on invalid NANGO_TASK_DISPATCH_QUEUE_URL', () => {
            expect(() => {
                parseEnvs(ENVS, { NANGO_TASK_DISPATCH_QUEUE_URL: 'not-a-url' });
            }).toThrow();
        });

        it('should throw on invalid NANGO_TASK_DISPATCH_DLQ_URL', () => {
            expect(() => {
                parseEnvs(ENVS, { NANGO_TASK_DISPATCH_DLQ_URL: 'not-a-url' });
            }).toThrow();
        });

        it('should coerce numeric vars from strings', () => {
            const res = parseEnvs(ENVS, {
                NANGO_TASK_DISPATCH_MAX_MESSAGES: '5',
                NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS: '10',
                NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS: '60',
                NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY: '100',
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: '8',
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: '3'
            });
            expect(res).toMatchObject({
                NANGO_TASK_DISPATCH_MAX_MESSAGES: 5,
                NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS: 10,
                NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS: 60,
                NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY: 100,
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: 8,
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: 3
            });
        });

        it('should reject NANGO_TASK_DISPATCH_MAX_MESSAGES outside [1,10]', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_MAX_MESSAGES: '0' })).toThrow();
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_MAX_MESSAGES: '11' })).toThrow();
        });

        it('should reject NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS outside [0,20]', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS: '-1' })).toThrow();
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS: '21' })).toThrow();
        });

        it('should reject NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS outside [0,43200]', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS: '-1' })).toThrow();
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS: '43201' })).toThrow();
        });

        it('should reject NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE outside [1,10]', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: '0' })).toThrow();
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: '11' })).toThrow();
        });

        it('should reject NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY below 1', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY: '0' })).toThrow();
        });

        it('should reject NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY below 1', () => {
            expect(() => parseEnvs(ENVS, { NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: '0' })).toThrow();
        });
    });
});

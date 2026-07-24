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

    it('should parse the control-plane MCP server URL', () => {
        const res = parseEnvs(ENVS, { NANGO_CONTROL_PLANE_MCP_SERVER_URL: 'https://mcp-development.nango.dev' });
        expect(res.NANGO_CONTROL_PLANE_MCP_SERVER_URL).toBe('https://mcp-development.nango.dev');
    });

    it('should parse E2B sandbox metric settings', () => {
        const res = parseEnvs(ENVS, {
            E2B_SANDBOX_METRICS_POLL_INTERVAL_MS: '120000',
            E2B_SANDBOX_METRICS_REQUEST_TIMEOUT_MS: '5000'
        });
        expect(res.E2B_SANDBOX_METRICS_POLL_INTERVAL_MS).toBe(120_000);
        expect(res.E2B_SANDBOX_METRICS_REQUEST_TIMEOUT_MS).toBe(5_000);
    });

    it('should parse the sandbox provider', () => {
        const res = parseEnvs(ENVS, { SANDBOX_PROVIDER: 'agentcore' });
        expect(res.SANDBOX_PROVIDER).toBe('agentcore');
    });

    it('should parse AgentCore sandbox settings', () => {
        const res = parseEnvs(ENVS, {
            AGENTCORE_RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/nango-runtime',
            AGENTCORE_RUNTIME_QUALIFIER: 'dev'
        });
        expect(res.AGENTCORE_RUNTIME_ARN).toBe('arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/nango-runtime');
        expect(res.AGENTCORE_RUNTIME_QUALIFIER).toBe('dev');
    });

    it('should default the AgentCore runtime qualifier', () => {
        const res = parseEnvs(ENVS, {
            AGENTCORE_RUNTIME_ARN: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/nango-runtime'
        });
        expect(res.AGENTCORE_RUNTIME_QUALIFIER).toBe('DEFAULT');
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

    it('should throw when queueUrls subject suffix is not a known pubsub subject', () => {
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

    it('should parse NANGO_PUBSUB_SNS_SQS_CONFIG with lambda_keep_warm subject', () => {
        const topicArns = { lambda_keep_warm: 'arn:aws:sns:us-east-1:123456789012:lambda-keep-warm' };
        const queueUrls = { 'jobs:lambda_keep_warm': 'https://sqs.us-east-1.amazonaws.com/123456789012/lambda-keep-warm-queue' };
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

    it('should default NANGO_OUTBOUND_URL_POLICY to undefined when unset', () => {
        const res = parseEnvs(ENVS, {});
        expect(res.NANGO_OUTBOUND_URL_POLICY).toBeUndefined();
    });

    it('should parse a valid NANGO_OUTBOUND_URL_POLICY', () => {
        const res = parseEnvs(ENVS, {
            NANGO_OUTBOUND_URL_POLICY: JSON.stringify({ mode: 'allowlist', allowlist: ['.hubspot.com'], blockPrivateIps: true, maxRedirects: 3 })
        });
        expect(res.NANGO_OUTBOUND_URL_POLICY).toEqual({ mode: 'allowlist', allowlist: ['.hubspot.com'], blockPrivateIps: true, maxRedirects: 3 });
    });

    it('should throw on invalid JSON in NANGO_OUTBOUND_URL_POLICY', () => {
        expect(() => {
            parseEnvs(ENVS, { NANGO_OUTBOUND_URL_POLICY: 'not-json' });
        }).toThrow('Invalid JSON in NANGO_OUTBOUND_URL_POLICY');
    });

    it('should throw on an invalid NANGO_OUTBOUND_URL_POLICY shape', () => {
        expect(() => {
            parseEnvs(ENVS, { NANGO_OUTBOUND_URL_POLICY: JSON.stringify({ mode: 'bogus' }) });
        }).toThrow();
    });

    it('should throw on unknown keys in NANGO_OUTBOUND_URL_POLICY (typos fail fast)', () => {
        expect(() => {
            // `blockPrivateIp` (missing trailing s) must not be silently dropped.
            parseEnvs(ENVS, { NANGO_OUTBOUND_URL_POLICY: JSON.stringify({ blockPrivateIp: false }) });
        }).toThrow();
    });

    it('should default NANGO_LOGS_PROVIDER to elasticsearch', () => {
        const res = parseEnvs(ENVS, {});
        expect(res.NANGO_LOGS_PROVIDER).toBe('elasticsearch');
    });

    it('should default NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED to true', () => {
        const res = parseEnvs(ENVS, {});
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED).toBe(true);
    });

    it('should parse NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED false', () => {
        const res = parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED: 'false' });
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED).toBe(false);
    });

    it('should default NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST to secure defaults when unset', () => {
        const res = parseEnvs(ENVS, {});
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([
            '169.254.169.254',
            'metadata.google.internal',
            'localhost',
            '127.0.0.1',
            '[::1]',
            '[::ffff:127.0.0.1]',
            '[::ffff:169.254.169.254]'
        ]);
    });

    it('should allow explicit opt-out of NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', () => {
        const resEmpty = parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: '[]' });
        expect(resEmpty.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([]);
        const resWhitespaceEmpty = parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: '[ ]' });
        expect(resWhitespaceEmpty.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([]);
        const resBlank = parseEnvs(ENVS, { NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: '' });
        expect(resBlank.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([]);
    });

    it('should merge custom NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST entries with defaults', () => {
        const res = parseEnvs(ENVS, {
            NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: JSON.stringify(['denylisted-proxy-test.invalid', ''])
        });
        expect(res.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST).toEqual([
            '169.254.169.254',
            'metadata.google.internal',
            'localhost',
            '127.0.0.1',
            '[::1]',
            '[::ffff:127.0.0.1]',
            '[::ffff:169.254.169.254]',
            'denylisted-proxy-test.invalid'
        ]);
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
                NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY: 5,
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

    describe('ORCHESTRATOR_WEBHOOK_*', () => {
        it('applies webhook admission defaults', () => {
            expect(parseEnvs(ENVS, {})).toMatchObject({
                ORCHESTRATOR_WEBHOOK_ADMISSION_MAX_CONCURRENCY: 5,
                ORCHESTRATOR_WEBHOOK_ADMISSION_DB_RESERVE: 10,
                ORCHESTRATOR_WEBHOOK_ADMISSION_RETRY_AFTER_MS: 1000
            });
        });

        it('rejects invalid webhook admission limits', () => {
            expect(() => parseEnvs(ENVS, { ORCHESTRATOR_DB_POOL_MAX: '0' })).toThrow();
            expect(() => parseEnvs(ENVS, { ORCHESTRATOR_WEBHOOK_ADMISSION_MAX_CONCURRENCY: '0' })).toThrow();
            expect(() => parseEnvs(ENVS, { ORCHESTRATOR_WEBHOOK_ADMISSION_DB_RESERVE: '-1' })).toThrow();
        });

        it('allows webhook admission limits to be clamped at orchestrator startup', () => {
            expect(
                parseEnvs(ENVS, {
                    ORCHESTRATOR_DB_POOL_MAX: '10',
                    ORCHESTRATOR_WEBHOOK_ADMISSION_DB_RESERVE: '4',
                    ORCHESTRATOR_WEBHOOK_ADMISSION_MAX_CONCURRENCY: '7'
                })
            ).toMatchObject({
                ORCHESTRATOR_DB_POOL_MAX: 10,
                ORCHESTRATOR_WEBHOOK_ADMISSION_DB_RESERVE: 4,
                ORCHESTRATOR_WEBHOOK_ADMISSION_MAX_CONCURRENCY: 7
            });
        });
    });
});

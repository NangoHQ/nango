import * as z from 'zod';

import { roles } from '../roles.js';

export const ENVS = z.object({
    // Node ecosystem
    NODE_ENV: z.enum(['production', 'staging', 'development', 'test']).default('development'), // TODO: a better name would be NANGO_ENV
    CI: z.coerce.boolean().default(false),
    VITEST: z.coerce.boolean().default(false),
    TZ: z.string().default('UTC'),

    // Dockerfile
    GIT_HASH: z.string().optional(),

    // Auth
    WORKOS_API_KEY: z.string().optional(),
    WORKOS_CLIENT_ID: z.string().optional(),
    NANGO_DASHBOARD_USERNAME: z.string().optional(),
    NANGO_DASHBOARD_PASSWORD: z.string().optional(),
    LOCAL_NANGO_USER_ID: z.coerce.number().optional(),
    AUTH_ALLOW_SIGNUP: z.stringbool().optional().default(true),
    DEFAULT_USER_ROLE: z.enum(roles).optional().default('administrator'),

    // API
    NANGO_PORT: z.coerce.number().optional().default(3003), // Sync those two ports?
    SERVER_PORT: z.coerce.number().optional().default(3003),
    NANGO_SERVER_URL: z.url().optional(),
    NANGO_SERVER_KEEP_ALIVE_TIMEOUT: z.coerce.number().optional().default(61_000),
    DEFAULT_RATE_LIMIT_PER_MIN: z.coerce.number().min(1).optional().default(200),
    NANGO_CACHE_ENV_KEYS: z.stringbool().optional().default(false),
    NANGO_SERVER_WEBSOCKETS_PATH: z.string().optional(),
    NANGO_ADMIN_INVITE_TOKEN: z.string().optional(),
    NANGO_SERVER_PUBLIC_BODY_LIMIT: z.string().optional().default('75mb'),
    SERVER_SHUTDOWN_DELAY_MS: z.coerce.number().optional().default(0),
    NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST: z
        .string()
        .transform((s, ctx) => {
            if (s.trim() === '') {
                return [];
            }
            try {
                const parsed = JSON.parse(s);
                if (!Array.isArray(parsed) || !parsed.every((item: unknown) => typeof item === 'string')) {
                    ctx.addIssue(`NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST must be a JSON array of strings`);
                    return z.NEVER;
                }
                return parsed;
            } catch {
                ctx.addIssue(`NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST must be a valid JSON array of strings`);
                return z.NEVER;
            }
        })
        .pipe(
            z.array(z.string()).transform((arr) => {
                return arr.map((e) => e.trim()).filter((e) => e.length > 0);
            })
        )
        .default([]),

    // Connect
    NANGO_PUBLIC_CONNECT_URL: z.url().optional(),
    NANGO_CONNECT_UI_PORT: z.coerce.number().optional().default(3009),
    PUBLIC_AUTHENTICATION_DEPRECATION_DATE: z.coerce.date().catch(new Date('2025-08-25')),

    // Crons
    CRON_EXPORT_USAGE_MINUTES: z.coerce.number().optional().default(60),
    CRON_TIMEOUT_LOGS_MINUTES: z.coerce.number().optional().default(10),
    CRON_DELETE_OLD_JOBS_LIMIT: z.coerce.number().optional().default(1000),
    CRON_DELETE_OLD_DATA_EVERY_MIN: z.coerce.number().optional().default(10),
    CRON_DELETE_OLD_JOBS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_CONNECT_SESSION_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_PRIVATE_KEYS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_OAUTH_SESSION_MAX_DAYS: z.coerce.number().optional().default(2),
    CRON_DELETE_OLD_INVITATIONS_MAX_DAYS: z.coerce.number().optional().default(2),
    CRON_DELETE_OLD_CONFIGS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_SYNC_CONFIGS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_CONNECTIONS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_DELETE_OLD_ENVIRONMENTS_MAX_DAYS: z.coerce.number().optional().default(31),
    CRON_REFRESH_CONNECTIONS_EVERY_MIN: z.coerce.number().optional().default(10),
    CRON_REFRESH_CONNECTIONS_LIMIT: z.coerce.number().optional().default(100),

    // Persist
    PERSIST_SERVICE_URL: z.url().optional(),
    PERSIST_AUTO_PRUNING_INTERVAL_MS: z.coerce.number().optional().default(5_000), // set to 0 to disable
    PERSIST_AUTO_PRUNING_LIMIT: z.coerce.number().optional().default(1_000),
    PERSIST_AUTO_PRUNING_STALE_AFTER_MS: z.coerce
        .number()
        .optional()
        .default(30 * 24 * 3600 * 1000), // 30 days
    PERSIST_AUTO_DELETING_INTERVAL_MS: z.coerce.number().optional().default(5_000), // set to 0 to disable
    PERSIST_AUTO_DELETING_LIMIT: z.coerce.number().optional().default(1_000),
    PERSIST_AUTO_DELETING_STALE_AFTER_MS: z.coerce
        .number()
        .optional()
        .default(60 * 24 * 3600 * 1000), // 60 days
    NANGO_PERSIST_PORT: z.coerce.number().optional().default(3007),

    // Orchestrator
    ORCHESTRATOR_SERVICE_URL: z.url().optional(),
    NANGO_ORCHESTRATOR_PORT: z.coerce.number().optional().default(3008),
    ORCHESTRATOR_DATABASE_URL: z.url().optional(),
    ORCHESTRATOR_DATABASE_SCHEMA: z.string().optional().default('nango_scheduler'),
    ORCHESTRATOR_DB_POOL_MAX: z.coerce.number().optional().default(50),
    ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS: z.coerce.number().optional().default(1000),
    ORCHESTRATOR_CLEANING_TICK_INTERVAL_MS: z.coerce.number().optional().default(10000),
    ORCHESTRATOR_CLEANING_OLDER_THAN_DAYS: z.coerce.number().optional().default(5),
    ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS: z.coerce.number().optional().default(100),
    ORCHESTRATOR_BACKPRESSURE_MONITORING_TICK_INTERVAL_MS: z.coerce.number().optional().default(10000),
    ORCHESTRATOR_BACKPRESSURE_MONITORING_TOP_N: z.coerce.number().optional().default(10),
    ORCHESTRATOR_TASK_CREATED_EVENT_DEBOUNCE_MS: z.coerce.number().optional().default(100),
    ORCHESTRATOR_TASK_CREATED_PER_GROUP_COUNT_MAX: z.coerce.number().optional().default(10_000),
    ORCHESTRATOR_DB_SSL: z.stringbool().optional().default(false),

    // Jobs
    JOBS_SERVICE_URL: z.url().optional().default('http://localhost:3005'),
    JOBS_NAMESPACE: z.string().optional().default('nango'),
    NANGO_JOBS_PORT: z.coerce.number().optional().default(3005),
    PROVIDERS_URL: z.url().optional(),
    PROVIDERS_RELOAD_INTERVAL: z.coerce.number().optional().default(60000),
    JOBS_PROCESSOR_CONFIG: z
        .string()
        .transform((s, ctx) => {
            try {
                return JSON.parse(s);
            } catch {
                ctx.addIssue(`Invalid JSON in JOBS_PROCESSOR_CONFIG`);
                return z.NEVER; // tells Zod to stop here and mark parse as failed
            }
        })
        .pipe(
            z.array(
                z.object({
                    groupKeyPattern: z.string(),
                    maxConcurrency: z.coerce.number()
                })
            )
        )
        .default([
            {
                groupKeyPattern: 'sync*',
                maxConcurrency: 200
            },
            {
                groupKeyPattern: 'action*',
                maxConcurrency: 200
            },
            {
                groupKeyPattern: 'webhook*',
                maxConcurrency: 200
            },
            {
                groupKeyPattern: 'on-event*',
                maxConcurrency: 50
            }
        ]),
    SYNC_ENVIRONMENT_MAX_CONCURRENCY: z.coerce.number().optional().default(500),
    ACTION_ENVIRONMENT_MAX_CONCURRENCY: z.coerce.number().optional().default(500),
    WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY: z.coerce.number().optional().default(500),
    ON_EVENT_ENVIRONMENT_MAX_CONCURRENCY: z.coerce.number().optional().default(100),

    // Runner
    RUNNER_SECRET_KEY: z.string().optional(),
    RUNNER_TYPE: z.enum(['LOCAL', 'REMOTE', 'RENDER', 'KUBERNETES']).default('LOCAL'),
    RUNNER_FLEET_ID: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional()
        .default('nango_runners'),
    RUNNER_LAMBDA_FLEET_ID: z.string().optional().default('nango_runners_lambda'),
    RUNNER_DO_NOT_DISRUPT: z.stringbool().optional().default(true),
    RUNNER_PROFILED_ACCOUNTS: z
        .string()
        .transform((s, ctx) => {
            try {
                return JSON.parse(s);
            } catch {
                ctx.addIssue(`RUNNER_PROFILED_ACCOUNTS must be a valid JSON array of strings`);
                return z.NEVER; // tells Zod to stop here and mark parse as failed
            }
        })
        .pipe(z.array(z.string()))
        .default([]),
    RUNNER_SERVICE_URL: z.url().optional(),
    NANGO_RUNNER_PATH: z.string().optional(),
    RUNNER_OWNER_ID: z.string().optional(),
    IDLE_MAX_DURATION_MS: z.coerce.number().default(0),
    RUNNER_NODE_ID: z.coerce.number().default(1),
    RUNNER_CONFLICT_RESOLUTION_MODE: z.enum(['IN_MEMORY', 'REDIS']).default('IN_MEMORY'),
    RUNNER_URL: z.url().optional(),
    RUNNER_MEMORY_WARNING_THRESHOLD: z.coerce.number().optional().default(85),
    RUNNER_NAMESPACE: z.string().optional().default('nango'),
    RUNNER_HTTP_LOG_SAMPLE_PCT: z.coerce.number().optional(),
    NAMESPACE_PER_RUNNER: z.stringbool().optional().default(false),
    RUNNER_CLIENT_HEADERS_TIMEOUT_MS: z.coerce.number().optional().default(10_000),
    RUNNER_CLIENT_CONNECT_TIMEOUT_MS: z.coerce.number().optional().default(5000),
    RUNNER_CLIENT_RESPONSE_TIMEOUT_MS: z.coerce.number().optional().default(15_000),
    RUNNER_MAX_REQUEST_CPU: z.coerce.number().optional().default(4000),
    RUNNER_MAX_REQUEST_MEMORY: z.coerce.number().optional().default(16384),
    RUNNER_MIN_REQUEST_CPU: z.coerce.number().optional().default(500),
    RUNNER_MIN_REQUEST_MEMORY: z.coerce.number().optional().default(512),
    RUNNER_REQUEST_CPU_MULTIPLIER: z.coerce.number().optional().default(1.4),
    RUNNER_REQUEST_MEMORY_MULTIPLIER: z.coerce.number().optional().default(1.4),
    RUNNER_ABORT_CHECK_INTERVAL_MS: z.coerce.number().optional().default(1_000),
    RUNNER_HEARTBEAT_INTERVAL_MS: z.coerce.number().optional().default(30_000),
    RUNNER_SYNC_CONFLICT_HEARTBEAT_INTERVAL_MULTIPLIER: z.coerce.number().optional().default(3.1),

    // FLEET
    RUNNERS_DATABASE_URL: z.url().optional(),
    FLEET_SUPERVISOR_LOCK_KEY: z.string().default('fleet_supervisor'),
    FLEET_TIMEOUT_PENDING_MS: z.coerce
        .number()
        .optional()
        .default(60 * 60 * 1000), // 1 hour
    FLEET_TIMEOUT_STARTING_MS: z.coerce
        .number()
        .optional()
        .default(5 * 60 * 1000), // 5 minutes
    FLEET_TIMEOUT_FINISHING_MS: z.coerce
        .number()
        .optional()
        .default(25 * 60 * 60 * 1000), // 25 hours
    FLEET_TIMEOUT_IDLE_MS: z.coerce
        .number()
        .optional()
        .default(15 * 60 * 1000), // 15 minutes
    FLEET_TIMEOUT_TERMINATED_MS: z.coerce
        .number()
        .optional()
        .default(24 * 60 * 60 * 1000), // 24 hours
    FLEET_TIMEOUT_ERROR_MS: z.coerce
        .number()
        .optional()
        .default(24 * 60 * 60 * 1000), // 24 hours
    FLEET_TIMEOUT_GET_RUNNING_NODE_MS: z.coerce
        .number()
        .optional()
        .default(60 * 1000), // 1 minute
    FLEET_RETRY_DELAY_GET_RUNNING_NODE_MS: z.coerce.number().optional().default(1000), // 1 sec
    FLEET_SUPERVISOR_TIMEOUT_TICK_MS: z.coerce
        .number()
        .optional()
        .default(60 * 1000), // 1 minute
    FLEET_SUPERVISOR_TIMEOUT_STOP_MS: z.coerce
        .number()
        .optional()
        .default(60 * 1000), // 1 minute
    FLEET_SUPERVISOR_RETRY_DELAY_MS: z.coerce
        .number()
        .optional()
        .default(5 * 1000), // 5 seconds
    FLEET_SUPERVISOR_WAIT_TICK_MS: z.coerce.number().optional().default(1000), // 1 sec
    FLEET_TIMEOUT_HEALTHY_MS: z.coerce
        .number()
        .optional()
        .default(2 * 60 * 1000), // 2 minutes
    FLEET_DB_POOL_MAX: z.coerce.number().optional().default(5),

    // Billing
    FLAG_PLAN_ENABLED: z.stringbool().optional().default(false),
    FLAG_USAGE_ENABLED: z.stringbool().optional().default(false),
    ORB_API_KEY: z.string().optional(),
    ORB_WEBHOOKS_SECRET: z.string().optional(),
    ORB_MAX_RETRIES: z.coerce.number().optional().default(3),
    ORB_RETRY_MAX_ATTEMPTS: z.coerce.number().optional().default(3),
    ORB_RETRY_INITIAL_DELAY_MS: z.coerce.number().optional().default(10_000),
    BILLING_INGEST_BATCH_SIZE: z.coerce.number().optional().default(500),
    BILLING_INGEST_BATCH_INTERVAL_MS: z.coerce.number().optional().default(5_000),
    BILLING_INGEST_MAX_QUEUE_SIZE: z.coerce.number().optional().default(100_000),
    BILLING_INGEST_MAX_RETRY: z.coerce.number().optional().default(3),

    // ClickHouse
    CLICKHOUSE_URL: z.string().optional(),
    CLICKHOUSE_USAGE_INGEST_BATCH_SIZE: z.coerce.number().optional().default(10_000),
    CLICKHOUSE_USAGE_INGEST_BATCH_INTERVAL_MS: z.coerce.number().optional().default(5_000),
    CLICKHOUSE_USAGE_INGEST_MAX_QUEUE_SIZE: z.coerce.number().optional().default(500_000),

    // Usage
    USAGE_CAPPING_ENABLED: z.stringbool().optional().default(false),
    USAGE_REVALIDATE_AFTER_MS: z.coerce.number().optional().default(3_600_000), // 1 hour
    USAGE_BILLING_API_MAX_RPS: z.coerce.number().optional().default(5), // max requests per second to Orb API usage endpoint is 10, keeping some margin
    USAGE_BILLING_API_MAX_QUEUE_SIZE: z.coerce.number().optional().default(100), // max queued requests by rate limiter
    USAGE_BILLING_API_CACHE_TTL_SECONDS: z.coerce
        .number()
        .optional()
        .default(3600 * 6), // 6 hour

    // --- Third parties
    // AWS
    AWS_REGION: z.string().optional(),
    AWS_BUCKET_NAME: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),

    AWS_INTEGRATIONS_ACCESS_KEY_ID: z.string().optional(),
    AWS_INTEGRATIONS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_INTEGRATIONS_REGION: z.string().optional(),
    AWS_INTEGRATIONS_BUCKET_NAME: z.string().optional(),

    // BQ
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    FLAG_AUTH_ROLES_ENABLED: z.stringbool().optional().default(false),
    FLAG_BIG_QUERY_EXPORT_ENABLED: z.stringbool().optional().default(false),

    // Datadog
    DD_ENV: z.string().optional(),
    DD_SITE: z.string().optional(),
    DD_TRACE_AGENT_URL: z.string().optional(),
    DD_API_KEY_SECRET_ARN: z.string().optional(),

    // Elasticsearch
    NANGO_LOGS_ES_URL: z.url().optional(),
    NANGO_LOGS_ES_REQUEST_TIMEOUT_MS: z.coerce.number().optional().default(5000),
    NANGO_LOGS_ES_MAX_RETRIES: z.coerce.number().optional().default(1),
    NANGO_LOGS_ES_USER: z.string().optional(),
    NANGO_LOGS_ES_PWD: z.string().optional(),
    NANGO_LOGS_ENABLED: z.stringbool().optional().default(false),
    NANGO_LOGS_ES_PREFIX: z.string().optional(),
    NANGO_LOGS_ES_INDEX_OPERATIONS: z.string().optional(),
    NANGO_LOGS_ES_INDEX_MESSAGES: z.string().optional(),
    NANGO_LOGS_ES_SHARD_PER_DAY_OPERATIONS: z.coerce.number().optional().default(1),
    NANGO_LOGS_ES_SHARD_PER_DAY_MESSAGES: z.coerce.number().optional().default(1),
    NANGO_LOGS_ES_WARM_MIN_AGE: z.string().optional().default('48h'),
    NANGO_LOGS_CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().optional().default(3),
    NANGO_LOGS_CIRCUIT_BREAKER_RECOVERY_THRESHOLD: z.coerce.number().optional().default(1),
    NANGO_LOGS_CIRCUIT_BREAKER_HEALTHCHECK_INTERVAL_MS: z.coerce.number().optional().default(3000),

    // Logodev
    PUBLIC_LOGODEV_KEY: z.string().optional(),

    // Mailgun
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_URL: z.url().optional(),

    // SMTP
    SMTP_URL: z.url().optional(),
    SMTP_FROM: z.string().default('Nango <noreply@email.nango.dev>'),
    SMTP_DOMAIN: z.string().default('email.nango.dev'),

    // Postgres
    NANGO_DATABASE_URL: z.url().optional(),
    NANGO_DB_READ_URL: z.url().optional(),
    NANGO_DB_HOST: z.string().optional().default('localhost'),
    NANGO_DB_PORT: z.coerce.number().optional().default(5432),
    NANGO_DB_USER: z.string().optional().default('nango'),
    NANGO_DB_NAME: z.string().optional().default('nango'),
    NANGO_DB_PASSWORD: z.string().optional().default('nango'),
    NANGO_DB_SSL: z.stringbool().optional().default(false),
    NANGO_DB_CLIENT: z.string().optional(),
    NANGO_ENCRYPTION_KEY: z
        .string({
            error: 'To learn more about NANGO_ENCRYPTION_KEY, reach out to support.'
        })
        .optional(),
    NANGO_DB_SCHEMA: z.string().optional().default('nango'),
    NANGO_DB_ADDITIONAL_SCHEMAS: z.string().optional(),
    NANGO_DB_APPLICATION_NAME: z.string().optional().default('[unknown]'),

    // PostHog
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().optional(),

    // Records
    RECORDS_DATABASE_URL: z.url().optional(),
    RECORDS_DATABASE_READ_URL: z.url().optional(),
    RECORDS_DATABASE_SCHEMA: z.string().optional().default('nango_records'),
    RECORDS_DATABASE_SSL: z.stringbool().optional().default(false),
    RECORDS_DATABASE_POOL_MIN: z.coerce.number().optional().default(2),
    RECORDS_DATABASE_POOL_MAX: z.coerce.number().optional().default(50),
    RECORDS_DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().optional().default(60000),
    RECORDS_BATCH_SIZE: z.coerce.number().optional().default(1000),

    // Redis (system boundary)
    NANGO_REDIS_URL: z.url().optional(),
    NANGO_REDIS_HOST: z.string().optional(),
    NANGO_REDIS_PORT: z.coerce.number().optional().default(6379),
    NANGO_REDIS_AUTH: z.string().optional(),

    // Redis (customer boundary)
    NANGO_CUSTOMER_REDIS_URL: z.url().optional(),
    NANGO_CUSTOMER_REDIS_HOST: z.string().optional(),
    NANGO_CUSTOMER_REDIS_PORT: z.coerce.number().optional().default(6379),
    NANGO_CUSTOMER_REDIS_AUTH: z.string().optional(),

    // Render
    RENDER_API_KEY: z.string().optional(),
    RENDER_SERVICE_CREATION_MAX_PER_MINUTE: z.coerce.number().optional(),
    RENDER_SERVICE_CREATION_MAX_PER_HOUR: z.coerce.number().optional(),
    RENDER_WAIT_WHEN_THROTTLED_MS: z.coerce.number().default(1000),
    IS_RENDER: z.stringbool().optional().default(false),

    // Sentry
    PUBLIC_SENTRY_KEY: z.string().optional(),
    SENTRY_DSN: z.url().optional(),

    // Slack
    NANGO_SLACK_INTEGRATION_KEY: z.string().optional().default('slack'),
    NANGO_ADMIN_UUID: z.string().uuid().optional(),

    // Stripe
    PUBLIC_STRIPE_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOKS_SECRET: z.string().optional(),

    // Internal API
    NANGO_INTERNAL_API_KEY: z.string().optional(),

    // LIMITS
    MAX_SYNCS_PER_CONNECTION: z.coerce.number().optional().default(100),

    // PubSub
    NANGO_PUBSUB_TRANSPORT: z.enum(['activemq', 'sns-sqs', 'migration', 'none']).optional().default('none'),
    NANGO_PUBSUB_SNS_SQS_MAX_MESSAGES: z.coerce.number().min(1).max(10).optional().default(10),
    NANGO_PUBSUB_SNS_SQS_WAIT_TIME_SECONDS: z.coerce.number().min(0).max(20).optional().default(20),
    NANGO_PUBSUB_SNS_SQS_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().min(0).max(43200).optional().default(30),
    NANGO_PUBSUB_SNS_SQS_CONFIG: z
        .string()
        .optional()
        .default('{}')
        .transform((s, ctx) => {
            try {
                return JSON.parse(s) as unknown;
            } catch {
                ctx.addIssue(`Invalid JSON in NANGO_PUBSUB_SNS_SQS_CONFIG`);
                return z.NEVER;
            }
        })
        .pipe(
            z.object({
                topicArns: z
                    .partialRecord(
                        z.enum(['user', 'usage', 'team']),
                        z.string().regex(/^arn:aws(?:-[a-z0-9]+)*:sns:[a-z0-9-]+:\d{12}:.+$/, 'must be a valid AWS SNS topic ARN')
                    )
                    .optional()
                    .default({}),
                queueUrls: z
                    .record(z.string(), z.url())
                    .check((payload) => {
                        const record = payload.value;
                        for (const key of Object.keys(record)) {
                            const lastColon = key.lastIndexOf(':');
                            if (lastColon < 0 || lastColon === key.length - 1) {
                                payload.issues.push({
                                    code: 'custom',
                                    message: `Invalid queueUrls key "${key}": expected consumerGroup:subject (subject must be user, usage, or team)`,
                                    path: [key],
                                    input: record[key]
                                });
                                continue;
                            }
                            const subject = key.slice(lastColon + 1);
                            if (!(subject === 'user' || subject === 'usage' || subject === 'team')) {
                                payload.issues.push({
                                    code: 'custom',
                                    message: `Invalid queueUrls key "${key}": subject after ':' must be user, usage, or team`,
                                    path: [key],
                                    input: record[key]
                                });
                            }
                        }
                    })
                    .optional()
                    .default({})
            })
        ),
    NANGO_ACTIVEMQ_URL: z.string().optional().default('ws://localhost:61614/ws'), // string to allow multiple commas separated URLs for active/replica brokers
    NANGO_ACTIVEMQ_USER: z.string().optional().default('admin'),
    NANGO_ACTIVEMQ_PASSWORD: z.string().optional().default('admin'),
    NANGO_ACTIVEMQ_CONNECT_TIMEOUT_MS: z.coerce.number().optional().default(10_000),

    // Lambda
    LAMBDA_ENABLED: z.stringbool().optional().default(false),
    LAMBDA_DEFAULT_PREFIX: z.string().optional().default('nango-runner-function'),
    LAMBDA_ECR_REGISTRY: z.string().optional(),
    LAMBDA_RUNTIME: z.enum(['nodejs22.x', 'nodejs24.x']).optional().default('nodejs22.x'),
    LAMBDA_EXECUTION_ROLE_ARN: z.string().optional(),
    LAMBDA_DEFAULT_LOG_RETENTION_DAYS: z.coerce.number().optional().default(7),
    LAMBDA_PERSIST_SERVICE_URL: z.url().optional(),
    LAMBDA_JOBS_SERVICE_URL: z.url().optional(),
    LAMBDA_PROVIDERS_URL: z.url().optional(),
    LAMBDA_SUBNET_IDS: z
        .string()
        .transform((s, ctx) => {
            try {
                return JSON.parse(s);
            } catch {
                ctx.addIssue(`LAMBDA_SUBNET_IDS must be a valid JSON array of strings`);
                return z.NEVER; // tells Zod to stop here and mark parse as failed
            }
        })
        .pipe(z.array(z.string()))
        .default([]),
    LAMBDA_SECURITY_GROUP_IDS: z
        .string()
        .transform((s, ctx) => {
            try {
                return JSON.parse(s);
            } catch {
                ctx.addIssue(`LAMBDA_SECURITY_GROUP_IDS must be a valid JSON array of strings`);
                return z.NEVER; // tells Zod to stop here and mark parse as failed
            }
        })
        .pipe(z.array(z.string()))
        .default([]),
    LAMBDA_ARCHITECTURE: z.enum(['arm64', 'x86_64']).optional().default('arm64'),
    LAMBDA_CREATE_TIMEOUT_SECS: z.coerce.number().optional().default(120),
    LAMBDA_EXECUTION_TIMEOUT_SECS: z.coerce.number().optional().default(900),
    LAMBDA_DEFAULT_MEMORY_MB: z.coerce.number().optional().default(512),
    LAMBDA_DEFAULT_STORAGE_MB: z.coerce.number().optional().default(512),
    LAMBDA_EXECUTION_INTERRUPT_AFTER_MULTIPLIER: z.coerce.number().optional().default(0.8), // interrupt execution after 80% of the timeout, to leave time for checkpointing and graceful shutdown
    LAMBDA_EXECUTION_KILL_AFTER_MULTIPLIER: z.coerce.number().optional().default(0.95), // force kill the lambda after 95% of the timeout, to allow for runner-controlled shutdown
    LAMBDA_FUNCTION_ALIAS: z.string().optional().default('latest'),
    LAMBDA_MINIMUM_PROVISIONED_CONCURRENCY: z.coerce.number().optional().default(1),
    LAMBDA_MAXIMUM_PROVISIONED_CONCURRENCY: z.coerce.number().optional().default(50),
    LAMBDA_PROVISIONED_CONCURRENCY_SCALING_TARGET: z.coerce.number().optional().default(0.7),
    LAMBDA_FAILURE_DESTINATION: z.string().optional(),
    LAMBDA_PAYLOADS_BUCKET_NAME: z.string().optional(),
    LAMBDA_PAYLOAD_MAX_SIZE_BYTES: z.coerce
        .number()
        .optional()
        .default(1024 * 1024), // 1MB
    LAMBDA_PAYLOAD_LIMIT_BYTES: z.coerce
        .number()
        .optional()
        .default(1024 * 1024 * 100), // 100MB
    LAMBDA_PAYLOAD_MAX_AGE_MS: z.coerce
        .number()
        .optional()
        .default(1000 * 60 * 60 * 24 * 29), // 29 days (1 less than lifecycle policy)
    // WEBHOOK DELIVERY CIRCUIT BREAKER
    NANGO_WEBHOOK_TIMEOUT_MS: z.coerce.number().optional().default(20_000),
    NANGO_WEBHOOK_RETRY_ATTEMPTS: z.coerce.number().optional().default(2),
    NANGO_WEBHOOK_CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().optional().default(5),
    NANGO_WEBHOOK_CIRCUIT_BREAKER_WINDOW_SECS: z.coerce.number().optional().default(10),
    NANGO_WEBHOOK_CIRCUIT_BREAKER_COOLDOWN_DURATION_SECS: z.coerce.number().optional().default(60),
    NANGO_WEBHOOK_CIRCUIT_BREAKER_AUTO_RESET_SECS: z.coerce.number().optional().default(3600),

    // ----- Others
    SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
    NANGO_CLOUD: z.stringbool().optional().default(false),
    NANGO_ENTERPRISE: z.stringbool().optional().default(false),
    NANGO_TELEMETRY_SDK: z.stringbool().optional().default(false),
    NANGO_ADMIN_KEY: z.string().optional(),
    NANGO_INTEGRATIONS_FULL_PATH: z.string().optional(),
    LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).optional().default('info')
});

export function parseEnvs<T extends z.ZodObject<any>>(schema: T, envs: Record<string, unknown> = process.env): z.ZodSafeParseSuccess<z.infer<T>>['data'] {
    const res = schema.safeParse(envs);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${zodErrorToString(res.error.issues)}`);
    }

    return res.data;
}

function zodErrorToString(issues: z.core.$ZodIssue[]) {
    return issues
        .map((issue) => {
            return `${issue.path.join('')} (${issue.code} ${issue.message})`;
        })
        .join(', ');
}

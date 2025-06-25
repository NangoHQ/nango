import { z } from 'zod';

const bool = z
    .enum(['true', 'false', ''])
    .optional()
    .default('false')
    .transform((value) => value === 'true');
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

    // API
    NANGO_PORT: z.coerce.number().optional().default(3003), // Sync those two ports?
    SERVER_PORT: z.coerce.number().optional().default(3003),
    NANGO_SERVER_URL: z.string().url().optional(),
    DEFAULT_RATE_LIMIT_PER_MIN: z.coerce.number().min(1).optional(),
    NANGO_CACHE_ENV_KEYS: bool,
    NANGO_SERVER_WEBSOCKETS_PATH: z.string().optional(),
    NANGO_ADMIN_INVITE_TOKEN: z.string().optional(),

    // Connect
    NANGO_PUBLIC_CONNECT_URL: z.string().url().optional(),
    NANGO_CONNECT_UI_PORT: z.coerce.number().optional().default(3009),

    // Crons
    CRON_EXPORT_USAGE_MINUTES: z.coerce.number().optional().default(5),
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
    PERSIST_SERVICE_URL: z.string().url().optional(),
    NANGO_PERSIST_PORT: z.coerce.number().optional().default(3007),

    // Orchestrator
    ORCHESTRATOR_SERVICE_URL: z.string().url().optional(),
    NANGO_ORCHESTRATOR_PORT: z.coerce.number().optional().default(3008),
    ORCHESTRATOR_DATABASE_URL: z.string().url().optional(),
    ORCHESTRATOR_DATABASE_SCHEMA: z.string().optional().default('nango_scheduler'),
    ORCHESTRATOR_DB_POOL_MAX: z.coerce.number().optional().default(50),
    ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS: z.coerce.number().optional().default(1000),
    ORCHESTRATOR_CLEANING_TICK_INTERVAL_MS: z.coerce.number().optional().default(10000),
    ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS: z.coerce.number().optional().default(100),

    // Jobs
    JOBS_SERVICE_URL: z.string().url().optional().default('http://localhost:3005'),
    NANGO_JOBS_PORT: z.coerce.number().optional().default(3005),
    PROVIDERS_URL: z.string().url().optional(),
    PROVIDERS_RELOAD_INTERVAL: z.coerce.number().optional().default(60000),

    // Runner
    RUNNER_TYPE: z.enum(['LOCAL', 'REMOTE', 'RENDER']).default('LOCAL'),
    RUNNER_SERVICE_URL: z.string().url().optional(),
    NANGO_RUNNER_PATH: z.string().optional(),
    RUNNER_OWNER_ID: z.string().optional(),
    IDLE_MAX_DURATION_MS: z.coerce.number().default(0),
    RUNNER_NODE_ID: z.coerce.number().optional(),
    RUNNER_URL: z.string().url().optional(),
    RUNNER_MEMORY_WARNING_THRESHOLD: z.coerce.number().optional().default(85),
    RUNNER_PERSIST_MAX_SOCKET_MAX_LIFETIME_MS: z.coerce.number().optional().default(30_000),

    // FLEET
    RUNNERS_DATABASE_URL: z.string().url().optional(),
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
        .default(24 * 60 * 60 * 1000), // 24 hours
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
    FLAG_PLAN_ENABLED: bool,
    FLAG_USAGE_ENABLED: bool,
    ORB_API_KEY: z.string().optional(),
    ORB_WEBHOOKS_SECRET: z.string().optional(),
    BILLING_INGEST_BATCH_SIZE: z.coerce.number().optional().default(500),
    BILLING_INGEST_BATCH_INTERVAL_MS: z.coerce.number().optional().default(2000),
    BILLING_INGEST_MAX_QUEUE_SIZE: z.coerce.number().optional().default(50_000),
    BILLING_INGEST_MAX_RETRY: z.coerce.number().optional().default(3),

    // --- Third parties
    // AWS
    AWS_REGION: z.string().optional(),
    AWS_BUCKET_NAME: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),

    // BQ
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    FLAG_BIG_QUERY_EXPORT_ENABLED: bool,

    // Datadog
    DD_ENV: z.string().optional(),
    DD_SITE: z.string().optional(),
    DD_TRACE_AGENT_URL: z.string().optional(),

    // Elasticsearch
    NANGO_LOGS_ES_URL: z.string().url().optional(),
    NANGO_LOGS_ES_USER: z.string().optional(),
    NANGO_LOGS_ES_PWD: z.string().optional(),
    NANGO_LOGS_ENABLED: bool,
    NANGO_LOGS_ES_INDEX: z.string().optional(),
    NANGO_LOGS_ES_SHARD_PER_DAY: z.coerce.number().optional().default(1),

    // Koala
    PUBLIC_KOALA_API_URL: z.string().url().optional(),
    PUBLIC_KOALA_CDN_URL: z.string().url().optional(),

    // Logodev
    PUBLIC_LOGODEV_KEY: z.string().optional(),

    // Mailgun
    MAILGUN_API_KEY: z.string().optional(),
    MAILGUN_URL: z.string().url().optional(),

    // SMTP
    SMTP_URL: z.string().url().optional(),
    SMTP_FROM: z.string().default('Nango <support@nango.dev>'),

    // Postgres
    NANGO_DATABASE_URL: z.string().url().optional(),
    NANGO_DB_READ_URL: z.string().url().optional(),
    NANGO_DB_HOST: z.string().optional().default('localhost'),
    NANGO_DB_PORT: z.coerce.number().optional().default(5432),
    NANGO_DB_USER: z.string().optional().default('nango'),
    NANGO_DB_NAME: z.string().optional().default('nango'),
    NANGO_DB_PASSWORD: z.string().optional().default('nango'),
    NANGO_DB_SSL: bool,
    NANGO_DB_CLIENT: z.string().optional(),
    NANGO_ENCRYPTION_KEY: z
        .string({
            required_error:
                'To learn more about NANGO_ENCRYPTION_KEY, please read the doc at https://docs.nango.dev/guides/self-hosting/free-self-hosting/overview#encrypt-sensitive-data'
        })
        .optional(),
    NANGO_DB_SCHEMA: z.string().optional().default('nango'),
    NANGO_DB_ADDITIONAL_SCHEMAS: z.string().optional(),
    NANGO_DB_APPLICATION_NAME: z.string().optional().default('[unknown]'),

    // PostHog
    PUBLIC_POSTHOG_KEY: z.string().optional(),
    PUBLIC_POSTHOG_HOST: z.string().optional(),

    // Records
    RECORDS_DATABASE_URL: z.string().url().optional(),
    RECORDS_DATABASE_READ_URL: z.string().url().optional(),
    RECORDS_DATABASE_SCHEMA: z.string().optional().default('nango_records'),

    // Redis
    NANGO_REDIS_URL: z.string().url().optional(),

    // Render
    RENDER_API_KEY: z.string().optional(),
    RENDER_SERVICE_CREATION_MAX_PER_MINUTE: z.coerce.number().optional(),
    RENDER_SERVICE_CREATION_MAX_PER_HOUR: z.coerce.number().optional(),
    RENDER_WAIT_WHEN_THROTTLED_MS: z.coerce.number().default(1000),
    IS_RENDER: bool,

    // Sentry
    PUBLIC_SENTRY_KEY: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),

    // Slack
    NANGO_SLACK_INTEGRATION_KEY: z.string().optional(),
    NANGO_ADMIN_UUID: z.string().uuid().optional(),

    // Stripe
    PUBLIC_STRIPE_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOKS_SECRET: z.string().optional(),

    // Internal API
    NANGO_INTERNAL_API_KEY: z.string().optional(),

    // LIMITS
    MAX_SYNCS_PER_CONNECTION: z.coerce.number().optional().default(100),

    // ----- Others
    SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
    NANGO_CLOUD: bool,
    NANGO_ENTERPRISE: bool,
    NANGO_TELEMETRY_SDK: bool,
    NANGO_ADMIN_KEY: z.string().optional(),
    NANGO_INTEGRATIONS_FULL_PATH: z.string().optional(),
    LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).optional().default('info')
});

export function parseEnvs<T extends z.ZodObject<any>>(schema: T, envs: Record<string, unknown> = process.env): z.SafeParseSuccess<z.infer<T>>['data'] {
    const res = schema.safeParse(envs);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${zodErrorToString(res.error.issues)}`);
    }

    return res.data;
}

function zodErrorToString(issues: z.ZodIssue[]) {
    return issues
        .map((issue) => {
            return `${issue.path.join('')} (${issue.code} ${issue.message})`;
        })
        .join(', ');
}

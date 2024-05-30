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

    // Persist
    PERSIST_SERVICE_URL: z.string().url().optional(),
    NANGO_PERSIST_PORT: z.coerce.number().optional().default(3007),

    // Orchestrator
    ORCHESTRATOR_SERVICE_URL: z.string().url().optional(),
    NANGO_ORCHESTRATOR_PORT: z.coerce.number().optional().default(3008),
    ORCHESTRATOR_DATABASE_URL: z.string().url().optional(),
    ORCHESTRATOR_DATABASE_SCHEMA: z.string().optional().default('nango_scheduler'),

    // Jobs
    JOBS_SERVICE_URL: z.string().url().optional(),
    NANGO_JOBS_PORT: z.coerce.number().optional().default(3005),

    // Runner
    RUNNER_SERVICE_URL: z.string().url().optional(),
    NANGO_RUNNER_PATH: z.string().optional(),
    RUNNER_OWNER_ID: z.string().optional(),
    RUNNER_ID: z.string().optional(),
    IDLE_MAX_DURATION_MS: z.coerce.number().default(0),

    // Demo
    DEFAULT_GITHUB_CLIENT_ID: z.string().optional(),
    DEFAULT_GITHUB_CLIENT_SECRET: z.string().optional(),

    // --- Third parties
    // AWS
    AWS_REGION: z.string().optional(),
    AWS_BUCKET_NAME: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),

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

    // Mailgun
    MAILGUN_API_KEY: z.string().optional(),

    // Postgres
    NANGO_DATABASE_URL: z.string().url().optional(),
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
                'To learn more about NANGO_ENCRYPTION_KEY, please read the doc at https://docs.nango.dev/host/self-host/self-hosting-instructions#encrypt-sensitive-data'
        })
        .optional(),
    NANGO_DB_MIGRATION_FOLDER: z.string().optional(),
    NANGO_DB_SCHEMA: z.string().optional().default('nango'),
    NANGO_DB_ADDITIONAL_SCHEMAS: z.string().optional(),

    // Records
    RECORDS_DATABASE_URL: z.string().url().optional().default('postgres://nango:nango@localhost:5432/nango'), //TODO remove default and deal with default value in the records package (ie: envVar || mainDB || localhost )
    RECORDS_DATABASE_SCHEMA: z.string().optional().default('nango_records'),

    // Redis
    NANGO_REDIS_URL: z.string().url().optional(),

    // Render
    RENDER_API_KEY: z.string().optional(),
    IS_RENDER: bool,

    // Slack
    NANGO_ADMIN_CONNECTION_ID: z.string().optional(),
    NANGO_SLACK_INTEGRATION_KEY: z.string().optional(),
    NANGO_ADMIN_UUID: z.string().uuid().optional(),

    // Sentry
    SENTRY_DNS: z.string().url().optional(),

    // Temporal
    TEMPORAL_NAMESPACE: z.string().optional(),
    TEMPORAL_ADDRESS: z.string().optional(),
    TEMPORAL_WORKER_MAX_CONCURRENCY: z.coerce.number().default(500),

    // ----- Others
    SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
    NANGO_CLOUD: bool,
    NANGO_ENTERPRISE: bool,
    NANGO_TELEMETRY_SDK: bool,
    NANGO_ADMIN_KEY: z.string().optional(),
    NANGO_INTEGRATIONS_FULL_PATH: z.string().optional(),
    TELEMETRY: bool,
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

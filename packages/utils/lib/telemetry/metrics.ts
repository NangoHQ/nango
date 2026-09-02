import tracer from 'dd-trace';

export enum Types {
    ACCOUNT_CREATED = 'nango.account.created',

    ACTION_INCOMING_PAYLOAD_SIZE_BYTES = 'nango.action.incoming.payloadSizeBytes',

    AUTH_SECRET_KEY_HASH_CACHE = 'nango.auth.secretKeyHashCache',
    AUTHZ_KEY_DERIVATION_COMPARISON = 'nango.authz.keyDerivationComparison',
    AUTHZ_ROLE_COMPARISON = 'nango.authz.roleComparison',
    AUTH_SHADOW_CACHE = 'nango.auth.shadowCache',
    AUTH_CONTEXT_CACHE = 'nango.auth.contextCache',
    AUTH_GET_ENV_BY_AGENT_SESSION = 'nango.auth.getEnvByAgentSession',
    AUTH_GET_ENV_BY_CONNECT_SESSION = 'nango.auth.getEnvByConnectSession',
    AUTH_GET_ENV_BY_SECRET_KEY = 'nango.auth.getEnvBySecretKey',
    AUTH_GET_ENV_BY_SECRET_KEY_SOURCE = 'nango.auth.getEnvBySecretKey.source',
    AUTH_GET_ENV_BY_CONNECT_SESSION_OR_SECRET_KEY = 'nango.auth.getEnvByConnectSessionOrSecretKey',
    AUTH_GET_ENV_BY_CONNECT_SESSION_OR_PUBLIC_KEY = 'nango.auth.getEnvByConnectSessionOrPublicKey',
    AUTH_WITH_PUBLIC_KEY = 'nango.auth.withPublicKey',
    AUTH_WITH_CONNECT_SESSION = 'nango.auth.withConnectSession',
    AUTH_SESSION = 'nango.auth.session',
    GET_CONNECTION = 'nango.server.getConnection',
    JOBS_DELETE_SYNCS_DATA = 'nango.jobs.cron.deleteSyncsData',
    JOBS_DELETE_SYNCS_DATA_DELETES = 'nango.jobs.cron.deleteSyncsData.deletes',
    JOBS_DELETE_SYNCS_DATA_JOBS = 'nango.jobs.cron.deleteSyncsData.jobs',
    JOBS_DELETE_SYNCS_DATA_RECORDS = 'nango.jobs.cron.deleteSyncsData.records',
    JOBS_DELETE_SYNCS_DATA_SCHEDULES = 'nango.jobs.cron.deleteSyncsData.schedules',
    JOBS_DELETE_OLD_DATA = 'nango.jobs.cron.deleteOldData',
    CRON_TRIAL = 'nango.cron.trial',

    LOGS_LOG = 'nango.logs.log',

    MFA_VERIFY_SUCCESS = 'nango.mfa.verify.success',
    MFA_VERIFY_FAILURE = 'nango.mfa.verify.failure',
    MFA_LOGIN_REFUSED = 'nango.mfa.login.refused',
    KVSTORE_SLIDING_WINDOW_USAGE = 'nango.kvstore.sliding_window.usage',
    KVSTORE_SLIDING_WINDOW_FAIL_OPEN = 'nango.kvstore.sliding_window.fail_open',
    BILLED_RECORDS_COUNT = 'nango.billed.records.count',
    MONTHLY_ACTIVE_RECORDS_COUNT = 'nango.monthly.active.records.count',
    PERSIST_RECORDS_COUNT = 'nango.persist.records.count',
    PERSIST_RECORDS_SIZE_IN_BYTES = 'nango.persist.records.sizeInBytes',
    PERSIST_RECORDS_MODIFIED_COUNT = 'nango.persist.records.modified.count',
    PERSIST_RECORDS_MODIFIED_SIZE_IN_BYTES = 'nango.persist.records.modified.sizeInBytes',

    POST_CONNECTION_SUCCESS = 'nango.postConnection.success',
    POST_CONNECTION_FAILURE = 'nango.postConnection.failure',
    PRE_CONNECTION_DELETION_SUCCESS = 'nango.preConnectionDeletion.success',
    PRE_CONNECTION_DELETION_FAILURE = 'nango.preConnectionDeletion.failure',

    PROXY = 'nango.server.proxyCall',
    PROXY_SUCCESS = 'nango.server.proxy.success',
    PROXY_FAILURE = 'nango.server.proxy.failure',
    DATA_TRANSFER = 'nango.dataTransfer',
    PROXY_REDIRECT = 'nango.server.proxy.redirect',
    PROXY_BASE_URL_OVERRIDE_DENIED = 'nango.server.proxy.baseUrlOverrideDenied',

    CRON_REFRESH_CONNECTIONS = 'nango.server.cron.refreshConnections',
    CRON_REFRESH_CONNECTIONS_FAILED = 'nango.server.cron.refreshConnections.failed',
    CRON_REFRESH_CONNECTIONS_SUCCESS = 'nango.server.cron.refreshConnections.success',
    CRON_LAMBDA_KEEP_WARM = 'nango.server.cron.lambdaKeepWarm',
    REFRESH_CONNECTIONS_FAILED = 'nango.server.refreshConnections.failed',
    REFRESH_CONNECTIONS_SUCCESS = 'nango.server.refreshConnections.success',
    REFRESH_CONNECTIONS_FRESH = 'nango.server.refreshConnections.fresh',
    REFRESH_CONNECTIONS_UNKNOWN = 'nango.server.refreshConnections.unknown',

    RUNNER_SDK = 'nango.runner.sdk',
    RUNNER_INVALID_SYNCS_RECORDS = 'nango.runner.invalidSyncsRecords',
    RUNNER_MEMORY_USAGE = 'nango.runner.memoryUsage',

    FUNCTION_EXECUTIONS = 'nango.jobs.function.executions',

    WEBHOOK_INCOMING_RECEIVED = 'nango.webhook.incoming.received',
    WEBHOOK_INCOMING_RATE_LIMITED = 'nango.webhook.incoming.rateLimited',
    WEBHOOK_INCOMING_SKIPPED = 'nango.webhook.incoming.skipped',
    WEBHOOK_INCOMING_FORWARDED_SUCCESS = 'nango.webhook.incoming.forwarded.success',
    WEBHOOK_INCOMING_FORWARDED_FAILED = 'nango.webhook.incoming.forwarded.failed',
    WEBHOOK_OUTGOING_SUCCESS = 'nango.webhook.outgoing.success',
    WEBHOOK_OUTGOING_FAILED = 'nango.webhook.outgoing.failed',
    WEBHOOK_ASYNC_ACTION_SUCCESS = 'nango.webhook.async_action.success',
    WEBHOOK_ASYNC_ACTION_FAILED = 'nango.webhook.async_action.failed',
    WEBHOOK_INCOMING_PAYLOAD_SIZE_BYTES = 'nango.webhook.incoming.payloadSizeBytes',
    WEBHOOK_REQUEST_SIZE_IN_BYTES = 'nango.webhook.request.sizeInBytes',
    WEBHOOK_RESPONSE_SIZE_IN_BYTES = 'nango.webhook.response.sizeInBytes',
    WEBHOOK_DIRECT_TRIGGER_SUCCESS = 'nango.webhook.direct_trigger.success',

    WEBHOOK_DISPATCH_PUBLISH_SUCCESS = 'nango.webhook.dispatch_queue.publish.success',
    WEBHOOK_DISPATCH_PUBLISH_FAILURE = 'nango.webhook.dispatch_queue.publish.failure',
    WEBHOOK_DISPATCH_BYPASS_OVERSIZE = 'nango.webhook.dispatch_queue.bypass_oversize',
    WEBHOOK_DISPATCH_LARGE_FANOUT = 'nango.webhook.dispatch_queue.large_fanout',
    // Consume outcome, tagged result=success|failure.
    WEBHOOK_DISPATCH_CONSUME = 'nango.webhook.dispatch_queue.consume',
    // Messages dropped without being scheduled, tagged reason=poison_pill|stale|task_cap.
    WEBHOOK_DISPATCH_DROPPED = 'nango.webhook.dispatch_queue.dropped',
    WEBHOOK_DISPATCH_DWELL_MS = 'nango.webhook.dispatch_queue.dwell_ms',
    WEBHOOK_DISPATCH_BATCH_SIZE = 'nango.webhook.dispatch_queue.batch_size',

    ORCH_TASKS_CREATED = 'nango.orch.tasks.created',
    ORCH_TASKS_DROPPED = 'nango.orch.tasks.dropped',
    ORCH_TASKS_REJECTED = 'nango.orch.tasks.rejected',
    ORCH_TASKS_STARTED = 'nango.orch.tasks.started',
    ORCH_TASKS_SUCCEEDED = 'nango.orch.tasks.succeeded',
    ORCH_TASKS_FAILED = 'nango.orch.tasks.failed',
    ORCH_TASKS_EXPIRED = 'nango.orch.tasks.expired',
    ORCH_TASKS_CANCELLED = 'nango.orch.tasks.cancelled',
    ORCH_QUEUE_BACKPRESSURE = 'nango.orch.queue.backpressure',
    ORCH_TASKS_DEQUEUED = 'nango.orch.tasks.dequeued',

    TASKS_ENQUEUED = 'nango.tasks.enqueued',
    TASKS_RETRIED = 'nango.tasks.retried',
    TASKS_STARTED = 'nango.tasks.started',
    TASKS_SUCCEEDED = 'nango.tasks.succeeded',
    TASKS_FAILED = 'nango.tasks.failed',
    TASKS_EXPIRED = 'nango.tasks.expired',
    TASKS_CANCELLED = 'nango.tasks.cancelled',
    TASKS_DROPPED = 'nango.tasks.dropped',
    TASKS_HANDLER_DURATION = 'nango.tasks.handler.duration',
    TASKS_QUEUE_DEPTH = 'nango.tasks.queue.depth',

    API_REQUEST_CONTENT_LENGTH = 'nango.api.request.content_length',
    DEPRECATED_V1_ENDPOINT_USED = 'nango.server.deprecated.v1.used',
    DEPRECATED_PUBLIC_ENDPOINT_USED = 'nango.server.deprecated.public.used',

    AUTH_SUCCESS = 'nango.server.auth.success',
    AUTH_FAILURE = 'nango.server.auth.failure',

    SLACK_NOTIFICATION_SUCCESS = 'nango.slack.notification.success',
    SLACK_NOTIFICATION_FAILURE = 'nango.slack.notification.failure',

    GET_RECORDS_COUNT = 'nango.server.getRecords.count',
    GET_RECORDS_SIZE_IN_BYTES = 'nango.server.getRecords.sizeInBytes',
    GET_RECORDS_RESPONSE_SIZE_BYTES = 'nango.server.getRecords.responseSizeBytes',

    CONNECTIONS_COUNT = 'nango.connections.count',
    CONNECTIONS_SEARCH_PARAM_USED = 'nango.server.connections.searchParamUsed',

    RECORDS_TOTAL_COUNT = 'nango.records.total.count',
    RECORDS_TOTAL_SIZE_IN_BYTES = 'nango.records.total.sizeInBytes',
    RECORDS_BUDGET_TRUNCATE = 'nango.records.budgetTruncate',

    CRON_PERSIST_ACCOUNT_USAGE = 'nango.server.cron.persistAccountUsage',

    DEPLOY_INCOMING_PAYLOAD_SIZE_BYTES = 'nango.server.deploy.incoming.payloadSizeBytes',
    DEPLOY_SECURITY_SCAN = 'nango.server.deploy.security.scan',

    EGRESS_BYTES = 'nango.server.egress.bytes',

    ACTION_CALLED_BY_MCP_SERVER = 'nango.mcp.called.action',
    MCP_TOOL_CALLS = 'nango.mcp.tool_calls',
    MCP_CLIENT_ID_METHOD = 'nango.mcp.client_id_method',

    E2B_RUNNING_SANDBOXES = 'nango.server.e2b.sandboxes.running',

    ORB_BILLING_EVENTS_INGESTED = 'nango.billing.orb.ingested',
    BILLING_USAGE_CACHE = 'nango.billing.usage.cache',
    BILLING_USAGE_ORB_MS = 'nango.billing.usage.orb.ms',
    BILLING_USAGE_ORB_ERRORS = 'nango.billing.usage.orb.errors',
    BILLING_PERIOD_COSTS_UNATTRIBUTED = 'nango.billing.period_costs.unattributed',
    BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_DURATION_MS = 'nango.billing.usage.clickhouse.batcher.ingest.duration_ms',
    BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_RESULT = 'nango.billing.usage.clickhouse.batcher.ingest.result',
    BILLING_USAGE_CLICKHOUSE_BATCHER_RETRY = 'nango.billing.usage.clickhouse.batcher.retry',
    BILLING_USAGE_CLICKHOUSE_QUERY_DURATION_MS = 'nango.billing.usage.clickhouse.query.duration_ms',
    BILLING_USAGE_CLICKHOUSE_TOP_DIMENSION_VALUES_DURATION_MS = 'nango.billing.usage.clickhouse.top_dimension_values.duration_ms',
    BILLING_USAGE_CLICKHOUSE_S3_EXPORT_FILE_RESULT = 'nango.billing.usage.clickhouse.s3_export.file.result',
    BILLING_USAGE_CLICKHOUSE_S3_EXPORT_RUN_RESULT = 'nango.billing.usage.clickhouse.s3_export.run.result',
    BILLING_USAGE_CLICKHOUSE_S3_EXPORT_DURATION_MS = 'nango.billing.usage.clickhouse.s3_export.duration_ms',
    BILLING_USAGE_CLICKHOUSE_S3_EXPORT_ROWS = 'nango.billing.usage.clickhouse.s3_export.rows',
    BILLING_USAGE_TRACKER_CALLS = 'nango.billing.usage.tracker.calls',
    BILLING_EVENTS_S3_DLQ_FILES = 'nango.billing.events.s3.dlq.files',
    BILLING_EVENTS_S3_DLQ_MONITOR_RUN_RESULT = 'nango.billing.events.s3.dlq.monitor.run.result',

    USAGE_IS_CAPPED = 'nango.capping.isCapped',

    PUBSUB_PUBLISH = 'nango.pubsub.publish',

    AUTH_CALLBACK_STATE_COOKIE = 'nango.server.auth.callback.state_cookie',

    AUDIT_EVENT_ENRICHMENT_FAILED = 'nango.audit.event.enrichment.failed',
    AUDIT_EVENT_RECORDED = 'nango.audit.event.recorded',
    AUDIT_EVENT_DROPPED = 'nango.audit.event.dropped',
    AUDIT_CLICKHOUSE_INGEST_RESULT = 'nango.audit.clickhouse.ingest.result',
    AUDIT_CONSUMER_BATCH_SIZE = 'nango.audit.consumer.batch.size',
    AUDIT_CONSUMER_REJECTED = 'nango.audit.consumer.rejected',

    FEATURE_FLAGS_CLIENT_UNAVAILABLE = 'nango.feature_flags.client.unavailable',
    FEATURE_FLAGS_CLIENT_RECONNECTED = 'nango.feature_flags.client.reconnected',
    FEATURE_FLAGS_EVALUATED = 'nango.feature_flags.evaluated'
}

type Dimensions = Record<string, string | number> | undefined;

const CARDINALITY_GATED_PROVIDER_CONFIG_KEY_METRICS = new Set<Types>([
    Types.REFRESH_CONNECTIONS_FAILED,
    Types.REFRESH_CONNECTIONS_FRESH,
    Types.REFRESH_CONNECTIONS_SUCCESS,
    Types.REFRESH_CONNECTIONS_UNKNOWN,
    Types.AUTH_SUCCESS,
    Types.AUTH_FAILURE,
    Types.POST_CONNECTION_SUCCESS,
    Types.POST_CONNECTION_FAILURE,
    Types.PRE_CONNECTION_DELETION_SUCCESS,
    Types.PRE_CONNECTION_DELETION_FAILURE,
    Types.WEBHOOK_INCOMING_RECEIVED,
    Types.WEBHOOK_DIRECT_TRIGGER_SUCCESS,
    Types.WEBHOOK_DISPATCH_LARGE_FANOUT,
    Types.WEBHOOK_DISPATCH_BYPASS_OVERSIZE,
    Types.WEBHOOK_DISPATCH_PUBLISH_SUCCESS,
    Types.WEBHOOK_DISPATCH_PUBLISH_FAILURE,
    Types.WEBHOOK_DISPATCH_DWELL_MS,
    Types.WEBHOOK_DISPATCH_CONSUME,
    Types.WEBHOOK_DISPATCH_DROPPED,
    Types.MCP_CLIENT_ID_METHOD,
    Types.PROXY,
    Types.PROXY_FAILURE,
    Types.PROXY_SUCCESS,
    Types.PROXY_BASE_URL_OVERRIDE_DENIED
]);

export function applyDimensionPolicy(metricName: Types, dimensions?: Dimensions): Dimensions {
    if (!dimensions) {
        return dimensions;
    }
    if (!CARDINALITY_GATED_PROVIDER_CONFIG_KEY_METRICS.has(metricName)) {
        return dimensions;
    }
    if (process.env['NANGO_METRICS_INCLUDE_PROVIDER_CONFIG_KEY']?.toLowerCase() === 'true') {
        return dimensions;
    }
    const { providerConfigKey: _providerConfigKey, ...rest } = dimensions;
    return rest;
}

export function increment(metricName: Types, value = 1, dimensions?: Dimensions): void {
    if (value === 0) {
        return;
    }
    tracer.dogstatsd.increment(metricName, value, applyDimensionPolicy(metricName, dimensions) ?? {});
}

export function decrement(metricName: Types, value = 1, dimensions?: Dimensions): void {
    if (value === 0) {
        return;
    }
    tracer.dogstatsd.decrement(metricName, value, applyDimensionPolicy(metricName, dimensions) ?? {});
}

export function gauge(metricName: Types, value?: number, dimensions?: Dimensions): void {
    tracer.dogstatsd.gauge(metricName, value ?? 1, applyDimensionPolicy(metricName, dimensions) ?? {});
}

export function histogram(metricName: Types, value: number): void {
    tracer.dogstatsd.histogram(metricName, value);
}

export function duration(metricName: Types, value: number, dimensions?: Dimensions): void {
    tracer.dogstatsd.distribution(metricName, value, applyDimensionPolicy(metricName, dimensions) ?? {});
}

export function distribution(metricName: Types, value: number, dimensions?: Dimensions): void {
    tracer.dogstatsd.distribution(metricName, value, applyDimensionPolicy(metricName, dimensions) ?? {});
}

export function time<F extends (...args: unknown[]) => unknown>(metricName: Types, func: F, dimensions?: Dimensions): F {
    const computeDuration = (start: [number, number]) => {
        const durationComponents = process.hrtime(start);
        const seconds = durationComponents[0];
        const nanoseconds = durationComponents[1];
        const total = seconds * 1000 + nanoseconds / 1e6;

        duration(metricName, total, dimensions);
    };

    // This function should handle both async/sync function
    // So it try/catch regular execution and use .then() for async
    // @ts-expect-error can't fix this
    return function wrapped(...args: any) {
        const start = process.hrtime();

        try {
            const res = func(...args) as any;
            if (typeof res === 'object' && res && res[Symbol.toStringTag] === 'Promise') {
                return res.then(
                    (v: unknown) => {
                        computeDuration(start);
                        return v;
                    },
                    (err: unknown) => {
                        computeDuration(start);
                        throw err;
                    }
                );
            }

            return res;
        } catch (err) {
            computeDuration(start);
            throw err;
        }
    };
}

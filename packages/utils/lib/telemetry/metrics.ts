import tracer from 'dd-trace';

export enum Types {
    ACTION_EXECUTION = 'nango.jobs.actionExecution',
    ACTION_SUCCESS = 'nango.orch.action.success',
    ACTION_FAILURE = 'nango.orch.action.failure',
    ACTION_TRACK_RUNTIME = 'action_track_runtime',

    AUTH_GET_ENV_BY_CONNECT_SESSION = 'nango.auth.getEnvByConnectSession',
    AUTH_GET_ENV_BY_SECRET_KEY = 'nango.auth.getEnvBySecretKey',
    AUTH_GET_ENV_BY_CONNECT_SESSION_OR_SECRET_KEY = 'nango.auth.getEnvByConnectSessionOrSecretKey',
    AUTH_GET_ENV_BY_CONNECT_SESSION_OR_PUBLIC_KEY = 'nango.auth.getEnvByConnectSessionOrPublicKey',
    AUTH_SESSION = 'nango.auth.session',
    GET_CONNECTION = 'nango.server.getConnection',
    JOBS_DELETE_SYNCS_DATA = 'nango.jobs.cron.deleteSyncsData',
    JOBS_DELETE_SYNCS_DATA_DELETES = 'nango.jobs.cron.deleteSyncsData.deletes',
    JOBS_DELETE_SYNCS_DATA_JOBS = 'nango.jobs.cron.deleteSyncsData.jobs',
    JOBS_DELETE_SYNCS_DATA_RECORDS = 'nango.jobs.cron.deleteSyncsData.records',
    JOBS_DELETE_SYNCS_DATA_SCHEDULES = 'nango.jobs.cron.deleteSyncsData.schedules',
    JOBS_DELETE_OLD_JOBS_DATA = 'nango.jobs.cron.deleteOldJobs',

    LOGS_LOG = 'nango.logs.log',
    PERSIST_RECORDS_COUNT = 'nango.persist.records.count',
    PERSIST_RECORDS_SIZE_IN_BYTES = 'nango.persist.records.sizeInBytes',

    ON_EVENT_SCRIPT_EXECUTION = 'nango.jobs.onEventScriptExecution',
    ON_EVENT_SCRIPT_RUNTIME = 'nango.jobs.onEventScriptRuntime',
    ON_EVENT_SCRIPT_SUCCESS = 'nango.orch.onEventScript.success',
    ON_EVENT_SCRIPT_FAILURE = 'nango.orch.onEventScript.failure',

    POST_CONNECTION_SUCCESS = 'nango.postConnection.success',
    POST_CONNECTION_FAILURE = 'nango.postConnection.failure',

    PROXY = 'nango.server.proxyCall',
    PROXY_SUCCESS = 'nango.server.proxy.success',
    PROXY_FAILURE = 'nango.server.proxy.failure',

    CRON_REFRESH_CONNECTIONS = 'nango.server.cron.refreshConnections',
    CRON_REFRESH_CONNECTIONS_FAILED = 'nango.server.cron.refreshConnections.failed',
    CRON_REFRESH_CONNECTIONS_SUCCESS = 'nango.server.cron.refreshConnections.success',
    REFRESH_CONNECTIONS_FAILED = 'nango.server.refreshConnections.failed',
    REFRESH_CONNECTIONS_SUCCESS = 'nango.server.refreshConnections.success',
    REFRESH_CONNECTIONS_FRESH = 'nango.server.refreshConnections.fresh',
    REFRESH_CONNECTIONS_UNKNOWN = 'nango.server.refreshConnections.unknown',

    RUNNER_SDK = 'nango.runner.sdk',
    RUNNER_INVALID_ACTION_INPUT = 'nango.runner.invalidActionInput',
    RUNNER_INVALID_ACTION_OUTPUT = 'nango.runner.invalidActionOutput',
    RUNNER_INVALID_SYNCS_RECORDS = 'nango.runner.invalidSyncsRecords',

    SYNC_EXECUTION = 'nango.jobs.syncExecution',
    SYNC_TRACK_RUNTIME = 'sync_script_track_runtime',
    SYNC_SUCCESS = 'nango.orch.sync.success',
    SYNC_FAILURE = 'nango.orch.sync.failure',

    WEBHOOK_EXECUTION = 'nango.jobs.webhookExecution',
    WEBHOOK_TRACK_RUNTIME = 'webhook_track_runtime',
    WEBHOOK_SUCCESS = 'nango.orch.webhook.success',
    WEBHOOK_FAILURE = 'nango.orch.webhook.failure',
    WEBHOOK_INCOMING_RECEIVED = 'nango.webhook.incoming.received',
    WEBHOOK_INCOMING_FORWARDED_SUCCESS = 'nango.webhook.incoming.forwarded.success',
    WEBHOOK_INCOMING_FORWARDED_FAILED = 'nango.webhook.incoming.forwarded.failed',
    WEBHOOK_OUTGOING_SUCCESS = 'nango.webhook.outgoing.success',
    WEBHOOK_OUTGOING_FAILED = 'nango.webhook.outgoing.failed',

    ORCH_TASKS_CREATED = 'nango.orch.tasks.created',
    ORCH_TASKS_STARTED = 'nango.orch.tasks.started',
    ORCH_TASKS_SUCCEEDED = 'nango.orch.tasks.succeeded',
    ORCH_TASKS_FAILED = 'nango.orch.tasks.failed',
    ORCH_TASKS_EXPIRED = 'nango.orch.tasks.expired',
    ORCH_TASKS_CANCELLED = 'nango.orch.tasks.cancelled',

    API_REQUEST_CONTENT_LENGTH = 'nango.api.request.content_length',

    AUTH_SUCCESS = 'nango.server.auth.success',
    AUTH_FAILURE = 'nango.server.auth.failure',

    GET_RECORDS_COUNT = 'nango.server.getRecords.count',
    GET_RECORDS_SIZE_IN_BYTES = 'nango.server.getRecords.sizeInBytes',

    CONNECTIONS_COUNT = 'nango.server.connections.count'
}

type Dimensions = Record<string, string | number> | undefined;

export function increment(metricName: Types, value = 1, dimensions?: Dimensions): void {
    tracer.dogstatsd.increment(metricName, value, dimensions ?? {});
}

export function decrement(metricName: Types, value = 1, dimensions?: Dimensions): void {
    tracer.dogstatsd.decrement(metricName, value, dimensions ?? {});
}

export function gauge(metricName: Types, value?: number, dimensions?: Dimensions): void {
    tracer.dogstatsd.gauge(metricName, value ?? 1, dimensions ?? {});
}

export function histogram(metricName: Types, value: number): void {
    tracer.dogstatsd.histogram(metricName, value);
}

export function duration(metricName: Types, value: number, dimensions?: Dimensions): void {
    tracer.dogstatsd.distribution(metricName, value, dimensions ?? {});
}

export function time<T, E, F extends (...args: E[]) => Promise<T>>(metricName: Types, func: F, dimensions?: Dimensions): F {
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
            const res = func(...args);
            if (res[Symbol.toStringTag] === 'Promise') {
                return res.then(
                    (v) => {
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

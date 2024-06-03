import tracer from 'dd-trace';

export enum Types {
    ACTION_EXECUTION = 'nango.jobs.actionExecution',
    ACTION_TRACK_RUNTIME = 'action_track_runtime',
    AUTH_GET_ENV_BY_SECRET_KEY = 'nango.auth.getEnvBySecretKey',
    AUTH_PUBLIC_KEY = 'nango.auth.publicKey',
    AUTH_SESSION = 'nango.auth.session',
    DB_POOL_ACQUISITION_DURATION = 'nango.db.pool.acquisition',
    DB_POOL_FREE = 'nango.db.pool.free',
    DB_POOL_USED = 'nango.db.pool.used',
    DB_POOL_WAITING = 'nango.db.pool.waiting',
    GET_CONNECTION = 'nango.server.getConnection',
    JOBS_CLEAN_ACTIVITY_LOGS = 'nango.jobs.cron.cleanActivityLogs',
    JOBS_DELETE_SYNCS_DATA = 'nango.jobs.cron.deleteSyncsData',
    JOBS_DELETE_SYNCS_DATA_DELETES = 'nango.jobs.cron.deleteSyncsData.deletes',
    JOBS_DELETE_SYNCS_DATA_JOBS = 'nango.jobs.cron.deleteSyncsData.jobs',
    JOBS_DELETE_SYNCS_DATA_RECORDS = 'nango.jobs.cron.deleteSyncsData.records',
    JOBS_DELETE_SYNCS_DATA_SCHEDULES = 'nango.jobs.cron.deleteSyncsData.schedules',
    LOGS_LOG = 'nango.logs.log',
    PERSIST_RECORDS_COUNT = 'nango.persist.records.count',
    PERSIST_RECORDS_SIZE_IN_BYTES = 'nango.persist.records.sizeInBytes',
    POST_CONNECTION_SCRIPT_RUNTIME = 'nango.jobs.postConnectionScriptRuntime',
    PROXY = 'nango.server.proxyCall',
    REFRESH_TOKENS = 'nango.server.cron.refreshTokens',
    REFRESH_TOKENS_FAILED = 'nango.server.cron.refreshTokens.failed',
    REFRESH_TOKENS_SUCCESS = 'nango.server.cron.refreshTokens.success',
    RUNNER_SDK = 'nango.runner.sdk',
    RENCONCILE_TEMPORAL_SCHEDULES = 'nango.jobs.cron.reconcileTemporalSchedules',
    RENCONCILE_TEMPORAL_SCHEDULES_FAILED = 'nango.jobs.cron.reconcileTemporalSchedules.failed',
    RENCONCILE_TEMPORAL_SCHEDULES_SUCCESS = 'nango.jobs.cron.reconcileTemporalSchedules.success',
    SYNC_EXECUTION = 'nango.jobs.syncExecution',
    SYNC_TRACK_RUNTIME = 'sync_script_track_runtime',
    WEBHOOK_EXECUTION = 'nango.jobs.webhookExecution',
    WEBHOOK_TRACK_RUNTIME = 'webhook_track_runtime'
}

export function increment(metricName: Types, value = 1, dimensions?: Record<string, string | number>): void {
    tracer.dogstatsd.increment(metricName, value, dimensions ?? {});
}

export function decrement(metricName: Types, value = 1, dimensions?: Record<string, string | number>): void {
    tracer.dogstatsd.decrement(metricName, value, dimensions ?? {});
}

export function gauge(metricName: Types, value?: number): void {
    tracer.dogstatsd.gauge(metricName, value ?? 1);
}

export function duration(metricName: Types, value: number): void {
    tracer.dogstatsd.distribution(metricName, value);
}

export function time<T, E, F extends (...args: E[]) => Promise<T>>(metricName: Types, func: F): F {
    const computeDuration = (start: [number, number]) => {
        const durationComponents = process.hrtime(start);
        const seconds = durationComponents[0];
        const nanoseconds = durationComponents[1];
        const total = seconds * 1000 + nanoseconds / 1e6;

        duration(metricName, total);
    };

    // This function should handle both async/sync function
    // So it's try/catch regular execution and use .then() for async
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
                    (err) => {
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

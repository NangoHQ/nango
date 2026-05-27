import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';
import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ RUNNER_NODE_ID: true }));

export const heartbeatIntervalMs = envs.RUNNER_HEARTBEAT_INTERVAL_MS;
export const abortCheckIntervalMs = envs.RUNNER_ABORT_CHECK_INTERVAL_MS;
export const runnerTelemetryBatchSize = envs.RUNNER_TELEMETRY_BATCH_SIZE;
export const runnerTelemetryFlushIntervalMs = envs.RUNNER_TELEMETRY_FLUSH_INTERVAL_MS;
export const lambdaTelemetryBatchSize = envs.LAMBDA_TELEMETRY_BATCH_SIZE;
export const lambdaTelemetryFlushIntervalMs = envs.LAMBDA_TELEMETRY_FLUSH_INTERVAL_MS;
export const resourcePoolEvictIdleMs = envs.RUNNER_RESOURCE_POOL_EVICT_IDLE_MS;

export const jobsServiceUrl = getJobsUrl();
export const persistServiceUrl = getPersistAPIUrl();

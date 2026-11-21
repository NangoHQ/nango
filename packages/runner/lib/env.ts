import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';
import { ENVS, parseEnvs } from '@nangohq/utils';

//TODO: re-add .required({ RUNNER_NODE_ID: true }) when other changes are ready
export const envs = parseEnvs(ENVS);

export const heartbeatIntervalMs = envs.RUNNER_HEARTBEAT_INTERVAL_MS;
export const abortCheckIntervalMs = envs.RUNNER_ABORT_CHECK_INTERVAL_MS;
export const syncConflictTtlMs = envs.RUNNER_HEARTBEAT_INTERVAL_MS * envs.RUNNER_SYNC_CONFLICT_HEARTBEAT_INTERVAL_MULTIPLIER;
export const telemetryBatchSize = envs.RUNNER_TELEMETRY_BATCH_SIZE;
export const telemetryFlushIntervalMs = envs.RUNNER_TELEMETRY_FLUSH_INTERVAL_MS;

export const jobsServiceUrl = getJobsUrl();
export const persistServiceUrl = getPersistAPIUrl();

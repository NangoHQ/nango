import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';
import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ RUNNER_NODE_ID: true }));

export const heartbeatIntervalMs = envs.RUNNER_HEARTBEAT_INTERVAL_MS;
export const abortCheckIntervalMs = envs.RUNNER_ABORT_CHECK_INTERVAL_MS;

export const jobsServiceUrl = getJobsUrl();
export const persistServiceUrl = getPersistAPIUrl();

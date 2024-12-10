import { ENVS, parseEnvs } from '@nangohq/utils';
import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';

export const envs = parseEnvs(ENVS);

export const heartbeatIntervalMs = 30_000;
export const runnerId = envs.RUNNER_ID || `${envs.RUNNER_NODE_ID}`;

export const jobsServiceUrl = process.env['NOTIFY_IDLE_ENDPOINT']?.replace(/\/idle$/, '') || getJobsUrl(); // TODO: remove legacy NOTIFY_IDLE_ENDPOINT once all runners are updated with JOBS_SERVICE_URL env var
export const persistServiceUrl = getPersistAPIUrl();

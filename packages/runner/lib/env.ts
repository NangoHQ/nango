import { ENVS, parseEnvs } from '@nangohq/utils';
import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';

export const envs = parseEnvs(ENVS);

export const jobsServiceUrl = getJobsUrl();
export const persistServiceUrl = getPersistAPIUrl();

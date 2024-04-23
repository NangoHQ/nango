import { parseEnvs, ENVS } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }));

import { parseEnvs, ENVS } from '@nangohq/utils/dist/environment/parse.js';

export const envs = parseEnvs(ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }));

import { parseEnvs, ENVS } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ NANGO_LOGS_OS_URL: true, NANGO_LOGS_OS_USER: true, NANGO_LOGS_OS_PWD: true }));

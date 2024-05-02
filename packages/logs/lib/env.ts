import { parseEnvs, ENVS, isLocal, isCloud } from '@nangohq/utils';

// Do not require in community and enterprise right now
const required = isCloud || isLocal;

export const envs = parseEnvs(required ? ENVS.required({ NANGO_LOGS_OS_URL: true, NANGO_LOGS_OS_USER: true, NANGO_LOGS_OS_PWD: true }) : ENVS);

envs.NANGO_LOGS_ENABLED = Boolean(envs.NANGO_LOGS_ENABLED && envs.NANGO_LOGS_OS_URL);

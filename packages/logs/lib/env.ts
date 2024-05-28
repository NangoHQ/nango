import { parseEnvs, ENVS } from '@nangohq/utils';

// Do not require in community and enterprise right now
const required = process.env['NANGO_LOGS_ENABLED'] === 'true';

export const envs = parseEnvs(required ? ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }) : ENVS);

envs.NANGO_LOGS_ENABLED = Boolean(envs.NANGO_LOGS_ENABLED && envs.NANGO_LOGS_ES_URL);

import { ENVS, MAX_ACTION_DURATION, MAX_SYNC_DURATION, MAX_WEBHOOK_DURATION, parseEnvs } from '@nangohq/utils';

// Do not require in community and enterprise right now
const required = process.env['NANGO_LOGS_ENABLED'] === 'true';

export const envs = parseEnvs(required ? ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }) : ENVS);

envs.NANGO_LOGS_ENABLED = Boolean(envs.NANGO_LOGS_ENABLED && envs.NANGO_LOGS_ES_URL);

export const defaultOperationExpiration = {
    action: () => new Date(Date.now() + MAX_ACTION_DURATION).toISOString(),
    webhook: () => new Date(Date.now() + MAX_WEBHOOK_DURATION).toISOString(),
    sync: () => new Date(Date.now() + MAX_SYNC_DURATION).toISOString(),
    auth: () => new Date(Date.now() + 300 * 1000).toISOString()
};

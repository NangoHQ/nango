import { parseEnvs, ENVS } from '@nangohq/utils';

// Because this file is being loaded by the CLI and runner it's not possible to required anything :(
// parseEnvs(ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }));
export const envs = parseEnvs(ENVS);

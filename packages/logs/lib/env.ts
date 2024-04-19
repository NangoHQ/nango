import { parseEnvs, ENVS } from '@nangohq/utils';
import { isCli } from './utils.js';

// Parsing conditionally because this file is being loaded by the CLI
const tmp = isCli ? null : parseEnvs(ENVS.required({ NANGO_LOGS_ES_URL: true, NANGO_LOGS_ES_USER: true, NANGO_LOGS_ES_PWD: true }));

// And we trick Typescript sorry
export const envs = (isCli ? parseEnvs(ENVS) : tmp) as Exclude<typeof tmp, null>;

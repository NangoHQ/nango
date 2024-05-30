import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS.required({ ORCHESTRATOR_SERVICE_URL: true }));

import { ENVS, parseEnvs } from '@nangohq/utils';

// Encryption key is required for persist to store/retrieve records
export const envs = parseEnvs(ENVS.required({ NANGO_ENCRYPTION_KEY: true }));

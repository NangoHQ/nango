import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS);

if (!envs.NANGO_ENCRYPTION_KEY && !envs.NANGO_ENCRYPTION_KEY_WRAPPED) {
    throw new Error('NANGO_ENCRYPTION_KEY or NANGO_ENCRYPTION_KEY_WRAPPED is required (generate with: openssl rand -base64 32)');
}

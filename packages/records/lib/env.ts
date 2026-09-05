import { DekRegistry } from '@nangohq/kms';
import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS);

if (!envs.NANGO_ENCRYPTION_KEY && !envs.NANGO_ENCRYPTION_KEY_WRAPPED && !envs.VITEST && envs.NODE_ENV !== 'test') {
    throw new Error('NANGO_ENCRYPTION_KEY or NANGO_ENCRYPTION_KEY_WRAPPED is required (generate with: openssl rand -base64 32)');
}

export const dek = await DekRegistry.create(envs);

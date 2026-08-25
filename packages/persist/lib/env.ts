import { DekRegistry } from '@nangohq/kms';
import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS);

// Encryption key is required for persist to store/retrieve records
const dek = await DekRegistry.create(envs);
if (!dek.get()) {
    throw new Error('NANGO_ENCRYPTION_KEY or NANGO_ENCRYPTION_KEY_WRAPPED is required');
}

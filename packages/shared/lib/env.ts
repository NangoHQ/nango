import { DekRegistry } from '@nangohq/kms';
import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS);

export const dek = await DekRegistry.create(envs);

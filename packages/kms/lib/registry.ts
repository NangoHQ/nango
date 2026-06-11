/**
 * Immutable holder for the unwrapped Data Encryption Key (DEK)
 * and it is resolved from the environment variables.
 * The key only ever lives in memory, never written to disk or logs.
 */
import { getLogger } from '@nangohq/utils';

import { assertDekLength, unwrapDek } from './envelope.js';

const logger = getLogger('kms');

/**
 * Canonical Additional Authenticated Data (AAD) bound to the global DEK wrap.
 * Changing this invalidates every existing wrapped DEK.
 */
export const GLOBAL_DEK_CONTEXT = {
    purpose: 'global_dek',
    app: 'nango'
} as const;

export interface DekEnvs {
    NANGO_ENCRYPTION_KEY?: string | undefined;
    NANGO_ENCRYPTION_KEY_WRAPPED?: string | undefined;
    NANGO_KMS_KEY_ARN?: string | undefined;
}

export class DekRegistry {
    private constructor(private readonly dek: string) {}

    /**
     * Resolve the DEK from the environment variables:
     * KMS unwrap when NANGO_ENCRYPTION_KEY_WRAPPED is set, passthrough for NANGO_ENCRYPTION_KEY.
     * Holds '' when neither is set (encryption disabled).
     */
    static async create(envs: DekEnvs): Promise<DekRegistry> {
        return new DekRegistry(await resolveDek(envs));
    }

    /**
     * Returns the DEK (base64, '' when encryption is disabled).
     */
    get(): string {
        return this.dek;
    }
}

async function resolveDek(envs: DekEnvs): Promise<string> {
    const { NANGO_ENCRYPTION_KEY: plaintext, NANGO_ENCRYPTION_KEY_WRAPPED: wrapped, NANGO_KMS_KEY_ARN: kmsKeyArn } = envs;

    if (plaintext && wrapped) {
        throw new Error('NANGO_ENCRYPTION_KEY and NANGO_ENCRYPTION_KEY_WRAPPED are mutually exclusive; set only one');
    }

    if (wrapped) {
        if (!kmsKeyArn) {
            throw new Error('NANGO_KMS_KEY_ARN is required when NANGO_ENCRYPTION_KEY_WRAPPED is set');
        }
        const dek = await unwrapDek({ wrapped, kmsKeyArn, expectedContext: GLOBAL_DEK_CONTEXT });
        logger.info('Loaded encryption key (source=kms)');
        return dek;
    }

    if (plaintext) {
        assertDekLength(Buffer.from(plaintext, 'base64'));
        logger.info('Loaded encryption key (source=plaintext)');
        return plaintext;
    }

    // Neither env set: encryption disabled (self-hosted without a key).
    return '';
}

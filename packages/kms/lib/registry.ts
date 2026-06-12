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

// Memoized so the unwrapping (and its KMS call) runs once per process
// since several packages can each instantiate a DekRegistry.
const resolved = new Map<string, string>();

async function resolveDek(envs: DekEnvs): Promise<string> {
    const { NANGO_ENCRYPTION_KEY: plaintext, NANGO_ENCRYPTION_KEY_WRAPPED: wrapped, NANGO_KMS_KEY_ARN: kmsKeyArn } = envs;

    const cacheKey = JSON.stringify([plaintext, wrapped, kmsKeyArn]);
    const cached = resolved.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    // Wrapped and plaintext keys are mutually exclusive: fail fast rather than silently picking one.
    if (wrapped && plaintext) {
        throw new Error('NANGO_ENCRYPTION_KEY and NANGO_ENCRYPTION_KEY_WRAPPED are mutually exclusive: set only one');
    }

    // Wrapped key is the source of truth (unwrap it via KMS).
    // Fallback to the plaintext key (dev/self hosted) or '' (encryption disabled) when neither is set.
    // Unwrap failures are fatal: we must not silently start up with the wrong key.
    let dek = '';
    if (wrapped) {
        if (!kmsKeyArn) {
            throw new Error('NANGO_KMS_KEY_ARN is required when NANGO_ENCRYPTION_KEY_WRAPPED is set');
        }
        dek = await unwrapDek({ wrapped, kmsKeyArn, expectedContext: GLOBAL_DEK_CONTEXT });
        logger.info('Loaded encryption key (source=wrapped)');
    } else if (plaintext) {
        assertDekLength(Buffer.from(plaintext, 'base64'));
        logger.info('Loaded encryption key (source=plaintext)');
        dek = plaintext;
    }

    resolved.set(cacheKey, dek);
    return dek;
}

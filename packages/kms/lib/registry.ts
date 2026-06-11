/**
 * Process-global holder for the unwrapped Data Encryption Key (DEK), and the
 * policy of how it is resolved from the environment.
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
    private dek: string | null = null;

    /**
     * Resolve the DEK from the environment variables and register it.
     * Call once at service startup before anything touches encrypted data.
     * Registers '' when encryption is disabled.
     */
    async load(envs: DekEnvs): Promise<void> {
        this.register(await resolveDek(envs));
    }

    /**
     * Register the DEK for this process.
     * Idempotent for the same value (so test setups and multiple bootstrap paths don't conflict)
     * but throws if a different key is already registered
     * ie: a silent key swap mid-process would corrupt every subsequent encryption.
     */
    private register(key: string): void {
        if (this.dek !== null && this.dek !== key) {
            throw new Error('A different encryption key is already registered for this process');
        }
        this.dek = key;
    }

    /**
     * Returns the registered DEK (base64, '' when encryption is disabled).
     * Throws if the DEK is not yet registered.
     */
    get(): string {
        if (this.dek === null) {
            throw new Error('Encryption key not loaded. Call globalDek.load() at service startup before using encryption.');
        }
        return this.dek;
    }

    exists(): boolean {
        return this.dek !== null;
    }
}

export const globalDek = new DekRegistry();

/**
 * Assert that the environment variables provide required information to resolve a DEK.
 */
export function requireDekEnv(envs: DekEnvs): void {
    if (!envs.NANGO_ENCRYPTION_KEY && !envs.NANGO_ENCRYPTION_KEY_WRAPPED) {
        throw new Error('One of NANGO_ENCRYPTION_KEY or NANGO_ENCRYPTION_KEY_WRAPPED is required');
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

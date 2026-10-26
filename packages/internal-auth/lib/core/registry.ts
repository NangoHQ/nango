import type { InternalAuthPublicKey } from '@nangohq/types';

export interface KeyRegistryEntry {
    iss: string;
    /** base64url of the raw 32-byte Ed25519 public key. */
    publicKey: string;
}

export type KeyRegistry = Record<string, KeyRegistryEntry>;

export function keyRegistryFromPublicKeys(entries: readonly InternalAuthPublicKey[] | undefined, iss: string): KeyRegistry {
    if (!entries) {
        return {};
    }
    const registry: KeyRegistry = {};
    for (const entry of entries) {
        registry[entry.kid] = { iss, publicKey: entry.publicKey };
    }
    return registry;
}

export function mergeKeyRegistries(...registries: KeyRegistry[]): KeyRegistry {
    const merged: KeyRegistry = {};
    for (const registry of registries) {
        Object.assign(merged, registry);
    }
    return merged;
}

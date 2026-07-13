import crypto from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const LOCK_STORAGE_PREFIX = 'runner:lock:';
const LOCK_OWNER_INDEX_PREFIX = `${LOCK_STORAGE_PREFIX}owner:`;
const LOCK_OWNER_INDEX_VALUE = '1';

export type LockNamespace = number;

function createHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest().subarray(0, 16).toString('base64url');
}

function namespacedLockKey(namespace: LockNamespace, key: string): string {
    return `${namespace}:${key}`;
}

function namespacedOwner(namespace: LockNamespace, owner: string): string {
    return `${namespace}:${owner}`;
}

function storageKey(namespace: LockNamespace, key: string): string {
    return `${LOCK_STORAGE_PREFIX}${createHash(namespacedLockKey(namespace, key))}`;
}

function ownerIndexKey(namespace: LockNamespace, owner: string, key: string): string {
    return `${LOCK_OWNER_INDEX_PREFIX}${createHash(namespacedOwner(namespace, owner))}:${createHash(namespacedLockKey(namespace, key))}`;
}

function lockKeys({ namespace, owner, key }: { namespace: LockNamespace; owner: string; key: string }): { sk: string; ik: string } {
    return { sk: storageKey(namespace, key), ik: ownerIndexKey(namespace, owner, key) };
}

function ownerIndexScanPrefix(namespace: LockNamespace, owner: string): string {
    return `${LOCK_OWNER_INDEX_PREFIX}${createHash(namespacedOwner(namespace, owner))}:`;
}

function mainKeyFromOwnerIndexKey(namespace: LockNamespace, owner: string, indexKey: string): string | null {
    const p = ownerIndexScanPrefix(namespace, owner);
    if (!indexKey.startsWith(p)) {
        return null;
    }
    const logicalHash = indexKey.slice(p.length);
    if (!logicalHash) {
        return null;
    }
    return `${LOCK_STORAGE_PREFIX}${logicalHash}`;
}

function validateNamespace(namespace: LockNamespace): Result<void> {
    if (!Number.isInteger(namespace) || namespace <= 0) {
        return Err('Invalid lock namespace (must be a positive integer)');
    }
    return Ok(undefined);
}

function validateTryAcquireInputs(namespace: LockNamespace, owner: string, key: string, ttlMs: number): Result<boolean> {
    const namespaceValidation = validateNamespace(namespace);
    if (namespaceValidation.isErr()) {
        return Err(namespaceValidation.error);
    }
    if (!owner || owner.length === 0 || owner.length > 255) {
        return Err('Invalid lock owner (must be between 1 and 255 characters)');
    }
    if (!key || key.length === 0 || key.length > 255) {
        return Err('Invalid lock key (must be between 1 and 255 characters)');
    }
    if (ttlMs <= 0) {
        return Err('Invalid lock TTL (must be greater than 0)');
    }
    return Ok(true);
}

export async function tryAcquireLock(
    store: KVStore,
    { namespace, owner, key, ttlMs }: { namespace: LockNamespace; owner: string; key: string; ttlMs: number }
): Promise<Result<boolean>> {
    const validation = validateTryAcquireInputs(namespace, owner, key, ttlMs);
    if (validation.isErr()) {
        return validation;
    }

    const { sk, ik } = lockKeys({ namespace, owner, key });
    try {
        if (
            await store.setIfValueEqualsWithCompanion({
                mainKey: sk,
                companionKey: ik,
                expectedValue: owner,
                newValue: owner,
                companionValue: LOCK_OWNER_INDEX_VALUE,
                ttlMs
            })
        ) {
            return Ok(true);
        }

        if (
            await store.setNxWithCompanion({
                mainKey: sk,
                companionKey: ik,
                value: owner,
                companionValue: LOCK_OWNER_INDEX_VALUE,
                ttlMs
            })
        ) {
            return Ok(true);
        }
        return Ok(false);
    } catch (err: unknown) {
        return Err(new Error(`Error acquiring lock for key ${key}`, { cause: err }));
    }
}

export async function releaseLock(
    store: KVStore,
    { namespace, owner, key }: { namespace: LockNamespace; owner: string; key: string }
): Promise<Result<boolean>> {
    const namespaceValidation = validateNamespace(namespace);
    if (namespaceValidation.isErr()) {
        return Err(namespaceValidation.error);
    }

    const { sk, ik } = lockKeys({ namespace, owner, key });
    try {
        const deleted = await store.deleteIfValueEqualsWithCompanion({
            mainKey: sk,
            companionKey: ik,
            expectedValue: owner
        });
        return Ok(deleted);
    } catch (err: unknown) {
        return Err(new Error(`Error releasing lock for key ${key}`, { cause: err }));
    }
}

export async function releaseAllLocks(store: KVStore, { namespace, owner }: { namespace: LockNamespace; owner: string }): Promise<Result<void>> {
    const namespaceValidation = validateNamespace(namespace);
    if (namespaceValidation.isErr()) {
        return namespaceValidation;
    }

    try {
        const prefix = ownerIndexScanPrefix(namespace, owner);
        for await (const ik of store.scan(`${prefix}*`)) {
            const sk = mainKeyFromOwnerIndexKey(namespace, owner, ik);
            if (sk) {
                await store.deleteIfValueEqualsWithCompanion({
                    mainKey: sk,
                    companionKey: ik,
                    expectedValue: owner
                });
            }
            await store.delete(ik);
        }
        return Ok(undefined);
    } catch (err: unknown) {
        return Err(new Error('Failed to release all locks for owner', { cause: err }));
    }
}

export async function hasLock(store: KVStore, { namespace, owner, key }: { namespace: LockNamespace; owner: string; key: string }): Promise<Result<boolean>> {
    const namespaceValidation = validateNamespace(namespace);
    if (namespaceValidation.isErr()) {
        return Err(namespaceValidation.error);
    }

    const { sk } = lockKeys({ namespace, owner, key });
    try {
        const holder = await store.get(sk);
        return Ok(holder === owner);
    } catch (err: unknown) {
        return Err(new Error(`Failed to check for lock with key ${key}`, { cause: err }));
    }
}

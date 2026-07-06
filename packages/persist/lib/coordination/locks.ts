import crypto from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const LOCK_STORAGE_PREFIX = 'runner:lock:';
const LOCK_OWNER_SET_PREFIX = `${LOCK_STORAGE_PREFIX}owner:`;
// Grace added to the owner-set TTL so it outlives the lock it indexes despite being written before the lock.
const OWNER_SET_TTL_GRACE_MS = 10_000;

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

function ownerSetKey(namespace: LockNamespace, owner: string): string {
    return `${LOCK_OWNER_SET_PREFIX}${createHash(namespacedOwner(namespace, owner))}`;
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

    const sk = storageKey(namespace, key);
    const os = ownerSetKey(namespace, owner);
    // The owner set is append-only: it may hold stale members but must never miss a live lock.
    const indexOwnerLock = async () => {
        await store.sAdd(os, sk, { ttlMs: ttlMs + OWNER_SET_TTL_GRACE_MS });
    };
    try {
        // Pre-index before acquiring, so a successful lock is not missed if we crash later.
        await indexOwnerLock();

        if (await store.setIfValueEquals(sk, owner, owner, ttlMs)) {
            // Re-extend after the refresh, so the set outlives the refreshed lock.
            await indexOwnerLock();
            return Ok(true);
        }

        try {
            await store.set(sk, owner, { canOverride: false, ttlMs });
        } catch (err) {
            if (err instanceof Error && err.message.includes('set_key_already_exists')) {
                return Ok(false);
            }
            throw err;
        }

        // Re-extend after the new lock write, so delay between pre-add and SET cannot make the set expire first.
        await indexOwnerLock();
        return Ok(true);
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

    const sk = storageKey(namespace, key);
    try {
        // Intentionally not removing the owner-set member: removing it could drop a concurrently re-acquired lock
        // Stale set member is harmless and will be cleaned by the set's TTL
        const deleted = await store.deleteIfValueEquals(sk, owner);
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

    const os = ownerSetKey(namespace, owner);
    try {
        // Intentionally not deleting the owner set: a wholesale delete could drop a member added by a concurrent acquire
        // Stale members are harmless no-ops and the set is cleaned by its TTL
        for (const sk of await store.sMembers(os)) {
            await store.deleteIfValueEquals(sk, owner);
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

    const sk = storageKey(namespace, key);
    try {
        const holder = await store.get(sk);
        return Ok(holder === owner);
    } catch (err: unknown) {
        return Err(new Error(`Failed to check for lock with key ${key}`, { cause: err }));
    }
}

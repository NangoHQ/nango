/* eslint-disable @typescript-eslint/require-await */
import crypto from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const LOCK_STORAGE_PREFIX = 'runner:lock:';
/** Secondary index: runner:lock:owner:<hash(owner)>:<hash(logicalKey)> — same TTL as the main lock key. */
const LOCK_OWNER_INDEX_PREFIX = `${LOCK_STORAGE_PREFIX}owner:`;
/** Placeholder value for owner-index entries (the key structure carries the identity). */
const LOCK_OWNER_INDEX_VALUE = '1';

interface Lock {
    key: string;
    owner: string;
    expiresAt: Date;
}

export interface Locks {
    tryAcquireLock: ({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }) => Promise<Result<boolean>>;
    releaseLock: ({ owner, key }: { owner: string; key: string }) => Promise<Result<boolean>>;
    releaseAllLocks: ({ owner }: { owner: string }) => Promise<Result<void>>;
    hasLock: ({ owner, key }: { owner: string; key: string }) => Promise<Result<boolean>>;
}

export class KVLocks implements Locks {
    private store: KVStore;

    constructor(store: KVStore) {
        this.store = store;
    }

    private createHash(key: string): string {
        return crypto.createHash('sha256').update(key).digest().subarray(0, 16).toString('base64url');
    }

    /** Stable KV key for a logical lock — mutual exclusion is per logical key, not per owner. */
    private storageKey(logicalKey: string): string {
        return `${LOCK_STORAGE_PREFIX}${this.createHash(logicalKey)}`;
    }

    /** Owner-scoped index entry so releaseAllLocks can scan only this owner's keys. */
    private ownerIndexKey(owner: string, logicalKey: string): string {
        return `${LOCK_OWNER_INDEX_PREFIX}${this.createHash(owner)}:${this.createHash(logicalKey)}`;
    }

    /** Main lock key plus owner-index key (always used together for acquire/release). */
    private lockKeys({ owner, key }: { owner: string; key: string }): { sk: string; ik: string } {
        return { sk: this.storageKey(key), ik: this.ownerIndexKey(owner, key) };
    }

    private ownerIndexScanPrefix(owner: string): string {
        return `${LOCK_OWNER_INDEX_PREFIX}${this.createHash(owner)}:`;
    }

    /** Derive the main lock key from an owner index key (suffix after owner prefix is the logical-key hash). */
    private mainKeyFromOwnerIndexKey(owner: string, indexKey: string): string | null {
        const p = this.ownerIndexScanPrefix(owner);
        if (!indexKey.startsWith(p)) {
            return null;
        }
        const logicalHash = indexKey.slice(p.length);
        if (!logicalHash) {
            return null;
        }
        return `${LOCK_STORAGE_PREFIX}${logicalHash}`;
    }

    private validateTryAcquireInputs(owner: string, key: string, ttlMs: number): Result<boolean> {
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

    public async tryAcquireLock({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
        const validation = this.validateTryAcquireInputs(owner, key, ttlMs);
        if (validation.isErr()) {
            return validation;
        }

        const { sk, ik } = this.lockKeys({ owner, key });
        try {
            // Same-owner TTL refresh (atomic on main + owner index). No leading get — avoids a stale read before refresh.
            if (
                await this.store.setIfValueEqualsWithCompanion({
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
                await this.store.setNxWithCompanion({
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
        } catch (err: any) {
            return Err(new Error(`Error acquiring lock for key ${key}`, { cause: err }));
        }
    }

    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const { sk, ik } = this.lockKeys({ owner, key });
        try {
            const deleted = await this.store.deleteIfValueEqualsWithCompanion({
                mainKey: sk,
                companionKey: ik,
                expectedValue: owner
            });
            return Ok(deleted);
        } catch (err: any) {
            return Err(new Error(`Error releasing lock for key ${key}`, { cause: err }));
        }
    }

    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        try {
            const prefix = this.ownerIndexScanPrefix(owner);
            for await (const ik of this.store.scan(`${prefix}*`)) {
                const sk = this.mainKeyFromOwnerIndexKey(owner, ik);
                if (sk) {
                    await this.store.deleteIfValueEqualsWithCompanion({
                        mainKey: sk,
                        companionKey: ik,
                        expectedValue: owner
                    });
                }
                // Drop index entry even if we no longer hold the main lock (stale index after handoff or TTL skew).
                await this.store.delete(ik);
            }
            return Ok(undefined);
        } catch (err: any) {
            return Err(new Error('Failed to release all locks for owner', { cause: err }));
        }
    }

    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const { sk } = this.lockKeys({ owner, key });
        try {
            const holder = await this.store.get(sk);
            return Ok(holder === owner);
        } catch (err: any) {
            return Err(new Error(`Failed to check for lock with key ${key}`, { cause: err }));
        }
    }
}

export class MapLocks implements Locks {
    private store = new Map<string, Lock>();

    public async tryAcquireLock({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
        if (!owner || owner.length === 0 || owner.length > 255) {
            return Err('Invalid lock owner (must be between 1 and 255 characters)');
        }
        if (!key || key.length === 0 || key.length > 255) {
            return Err('Invalid lock key (must be between 1 and 255 characters)');
        }
        if (ttlMs <= 0) {
            return Err('Invalid lock TTL (must be greater than 0)');
        }

        const now = new Date();

        // If the lock is already held by the same owner, or if it has expired, we can acquire it
        const existing = this.store.get(key);
        if (existing && existing.expiresAt > now && existing.owner !== owner) {
            return Ok(false);
        }
        this.store.set(key, { key, owner, expiresAt: new Date(now.getTime() + ttlMs) });

        return Ok(true);
    }

    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        // If the lock is held by the same owner, release it
        const lock = this.store.get(key);
        if (lock && lock.owner === owner) {
            this.store.delete(key);
            return Ok(true);
        }
        return Ok(false);
    }

    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        for (const [key, lock] of this.store.entries()) {
            if (lock.owner === owner) {
                void this.releaseLock({ owner, key });
            }
        }
        return Ok(undefined);
    }

    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const lock = this.store.get(key);
        if (lock && lock.owner === owner && lock.expiresAt >= new Date()) {
            return Ok(true);
        }
        return Ok(false);
    }
}

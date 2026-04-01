/* eslint-disable @typescript-eslint/require-await */
import crypto from 'node:crypto';

import { Err, Ok } from '@nangohq/utils';

import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

const LOCK_STORAGE_PREFIX = 'runner:lock:';

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

    private validateTryAcquireInputs(owner: string, key: string, ttlMs: number): Result<boolean> | null {
        if (!owner || owner.length === 0 || owner.length > 255) {
            return Err('Invalid lock owner (must be between 1 and 255 characters)');
        }
        if (!key || key.length === 0 || key.length > 255) {
            return Err('Invalid lock key (must be between 1 and 255 characters)');
        }
        if (ttlMs <= 0) {
            return Err('Invalid lock TTL (must be greater than 0)');
        }
        return null;
    }

    public async tryAcquireLock({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
        const invalid = this.validateTryAcquireInputs(owner, key, ttlMs);
        if (invalid) {
            return invalid;
        }

        const sk = this.storageKey(key);
        try {
            const current = await this.store.get(sk);
            if (current !== null) {
                if (current === owner) {
                    await this.store.set(sk, owner, { canOverride: true, ttlMs });
                    return Ok(true);
                }
                return Ok(false);
            }

            await this.store.set(sk, owner, { canOverride: false, ttlMs });
            return Ok(true);
        } catch (err: any) {
            if (err instanceof Error && err.message === 'set_key_already_exists') {
                return Ok(false);
            }
            return Err(new Error(`Error acquiring lock for key ${key}`, { cause: err }));
        }
    }

    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const sk = this.storageKey(key);
        try {
            const holder = await this.store.get(sk);
            if (holder === owner) {
                await this.store.delete(sk);
                return Ok(true);
            }
            return Ok(false);
        } catch (err: any) {
            return Err(new Error(`Error releasing lock for key ${key}`, { cause: err }));
        }
    }

    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        try {
            for await (const sk of this.store.scan(`${LOCK_STORAGE_PREFIX}*`)) {
                const holder = await this.store.get(sk);
                if (holder === owner) {
                    await this.store.delete(sk);
                }
            }
            return Ok(undefined);
        } catch (err: any) {
            return Err(new Error('Failed to release all locks for owner', { cause: err }));
        }
    }

    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        const sk = this.storageKey(key);
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

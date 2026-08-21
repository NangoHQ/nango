/* eslint-disable @typescript-eslint/require-await */
import { Err, Ok } from '@nangohq/utils';

import type { PersistClient } from '../clients/persist.js';
import type { Result } from '@nangohq/utils';

export interface Locks {
    tryAcquireLock: ({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }) => Promise<Result<boolean>>;
    releaseLock: ({ owner, key }: { owner: string; key: string }) => Promise<Result<boolean>>;
    releaseAllLocks: ({ owner }: { owner: string }) => Promise<Result<void>>;
    hasLock: ({ owner, key }: { owner: string; key: string }) => Promise<Result<boolean>>;
}

export class HttpLocks implements Locks {
    private persistClient: PersistClient;
    private environmentId: number;

    constructor({ persistClient, environmentId }: { persistClient: PersistClient; environmentId: number }) {
        this.persistClient = persistClient;
        this.environmentId = environmentId;
    }

    public async tryAcquireLock({ owner, key, ttlMs }: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
        return this.persistClient.tryAcquireLock({ environmentId: this.environmentId, owner, key, ttlMs });
    }

    public async releaseLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        return this.persistClient.releaseLock({ environmentId: this.environmentId, owner, key });
    }

    public async releaseAllLocks({ owner }: { owner: string }): Promise<Result<void>> {
        return this.persistClient.releaseAllLocks({ environmentId: this.environmentId, owner });
    }

    public async hasLock({ owner, key }: { owner: string; key: string }): Promise<Result<boolean>> {
        return this.persistClient.hasLock({ environmentId: this.environmentId, owner, key });
    }
}

interface Lock {
    key: string;
    owner: string;
    expiresAt: Date;
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

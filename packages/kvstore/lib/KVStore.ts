import type { MaybePromise } from '@nangohq/types';

export interface KVStore {
    destroy(): MaybePromise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlInMs?: number }): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlInMs?: number }): MaybePromise<number>;
}

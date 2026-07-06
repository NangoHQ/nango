export interface KVStore {
    destroy(): Promise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlMs?: number }): Promise<void>;
    // If the key exists and its value equals `expectedValue`, set it to `newValue` with TTL (atomically). Used for lock refresh without clobbering a newer holder.
    setIfValueEquals(key: string, expectedValue: string, newValue: string, ttlMs: number): Promise<boolean>;
    // If the key exists and its value equals `expectedValue`, delete it (atomically). Used for lock release without deleting a newer holder.
    deleteIfValueEquals(key: string, expectedValue: string): Promise<boolean>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number>;

    // Set operations
    sAdd(key: string, member: string, opts?: { ttlMs?: number }): Promise<void>;
    sMembers(key: string): Promise<string[]>; // all members of the set ([] when absent/expired)
}

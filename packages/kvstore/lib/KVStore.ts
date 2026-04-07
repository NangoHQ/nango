export interface KVStore {
    destroy(): Promise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlMs?: number }): Promise<void>;
    /**
     * If the key exists and its value equals `expectedValue`, set it to `newValue` with TTL (atomically).
     * Returns whether the write ran. Used for lock refresh without clobbering a newer holder.
     */
    setIfValueEquals(key: string, expectedValue: string, newValue: string, ttlMs: number): Promise<boolean>;
    /**
     * If the key exists and its value equals `expectedValue`, delete it (atomically).
     * Returns whether a key was removed. Used for lock release without deleting a newer holder.
     */
    deleteIfValueEquals(key: string, expectedValue: string): Promise<boolean>;
    /**
     * If mainKey is absent, set mainKey and companionKey with the same TTL (atomically).
     * Returns true if both were written; false if mainKey already exists.
     */
    setNxWithCompanion(mainKey: string, companionKey: string, value: string, companionValue: string, ttlMs: number): Promise<boolean>;
    /**
     * If mainKey exists and equals expectedValue, refresh TTL on mainKey and companionKey (atomically).
     * companionValue is written to companionKey on success.
     */
    setIfValueEqualsWithCompanion(
        mainKey: string,
        companionKey: string,
        expectedValue: string,
        newValue: string,
        companionValue: string,
        ttlMs: number
    ): Promise<boolean>;
    /**
     * If mainKey exists and equals expectedValue, delete mainKey and companionKey (atomically).
     */
    deleteIfValueEqualsWithCompanion(mainKey: string, companionKey: string, expectedValue: string): Promise<boolean>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number>;
    scan(pattern: string): AsyncGenerator<string>;
}

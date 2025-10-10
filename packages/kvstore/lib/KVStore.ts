export interface KVStore {
    destroy(): Promise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlMs?: number }): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number>;
    scan(pattern: string): AsyncGenerator<string>;
    hSetAll(key: string, value: Record<string, string>, options?: { canOverride?: boolean; ttlMs?: number }): Promise<void>;
    hSet(key: string, field: string, value: string, options: { canOverride?: boolean }): Promise<void>;
    hGetAll(key: string): Promise<Record<string, string> | null>;
    hGet(key: string, field: string): Promise<string | null>;
    hIncrBy(key: string, field: string, delta: number): Promise<number>;
}

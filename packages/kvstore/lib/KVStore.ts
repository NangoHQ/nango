export interface KVStore {
    destroy(): Promise<void>;
    set(key: string, value: string, options?: { canOverride?: boolean; ttlMs?: number }): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number>;
    scan(pattern: string): AsyncGenerator<string>;
}

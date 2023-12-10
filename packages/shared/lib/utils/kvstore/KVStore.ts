export interface KVStore {
    set(key: string, value: string, canOverride?: boolean, ttlInMs?: number): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
}

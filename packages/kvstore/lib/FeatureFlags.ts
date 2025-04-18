import type { KVStore } from './KVStore.js';

export class FeatureFlags {
    kvstore: KVStore;

    constructor(kvstore: KVStore) {
        this.kvstore = kvstore;
    }

    async isSet(key: string, { distinctId = 'global', fallback = false }: { distinctId?: string; fallback?: boolean } = {}): Promise<boolean> {
        try {
            return await this.kvstore.exists(`flag:${key}:${distinctId}`);
        } catch {
            return fallback;
        }
    }
}

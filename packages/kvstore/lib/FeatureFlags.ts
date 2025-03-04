import type { KVStore } from './KVStore.js';

export class FeatureFlags {
    kvstore: KVStore;

    constructor(kvstore: KVStore) {
        this.kvstore = kvstore;
    }

    async isSet({ key, distinctId = 'global', fallback = false }: { key: string; distinctId?: string; fallback?: boolean }): Promise<boolean> {
        try {
            return await this.kvstore.exists(`flag:${key}:${distinctId}`);
        } catch {
            return fallback;
        }
    }
}

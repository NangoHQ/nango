import { getLogger } from '@nangohq/utils';
import type { KVStore } from './KVStore.js';

const logger = getLogger('FeatureFlags');

export class FeatureFlags {
    kvstore: KVStore | undefined;

    constructor(kvstore: KVStore | undefined) {
        if (!kvstore) {
            logger.error('Feature flags not enabled');
        }

        this.kvstore = kvstore;
    }

    async isEnabled({
        key,
        distinctId,
        fallback,
        isExcludingFlag = false
    }: {
        key: string;
        distinctId: string;
        fallback: boolean;
        isExcludingFlag?: boolean;
    }): Promise<boolean> {
        if (!this.kvstore) {
            return fallback;
        }

        try {
            const exists = await this.kvstore.exists(`flag:${key}:${distinctId}`);
            return isExcludingFlag ? !exists : exists;
        } catch {
            return fallback;
        }
    }
}

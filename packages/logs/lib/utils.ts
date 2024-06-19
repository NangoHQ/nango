import { getLogger } from '@nangohq/utils';
import { createKVStore } from '@nangohq/kvstore';
import type { KVStore } from '@nangohq/kvstore';

export const logger = getLogger('logs');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

let kvstore: KVStore;
export async function getKVStore() {
    if (!kvstore) {
        kvstore = await createKVStore();
    }

    return kvstore;
}

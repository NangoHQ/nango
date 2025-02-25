import { errorToObject, getLogger } from '@nangohq/utils';
import { createKVStore } from '@nangohq/kvstore';
import type { KVStore } from '@nangohq/kvstore';
import type { MessageRow } from '@nangohq/types';

export const logger = getLogger('logs');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

let kvstore: KVStore;
export async function getKVStore() {
    if (!kvstore) {
        kvstore = await createKVStore();
    }

    return kvstore;
}

export const logLevelToLogger = {
    info: 'info',
    debug: 'debug',
    error: 'error',
    warn: 'warning',
    http: 'info',
    verbose: 'debug',
    silly: 'debug'
} as const;

export function errorToDocument(error?: unknown): MessageRow['error'] {
    if (!error) {
        return;
    }

    const err = { name: 'Unknown Error', message: 'unknown error', ...errorToObject(error) };
    return {
        name: error instanceof Error ? error.constructor.name : err.name,
        message: err.message,
        type: 'type' in err ? (err.type as string) : undefined,
        payload: 'payload' in err ? err.payload : undefined
    };
}

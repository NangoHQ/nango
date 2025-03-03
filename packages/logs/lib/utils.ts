import { errorToObject, getLogger } from '@nangohq/utils';
import { createKVStore } from '@nangohq/kvstore';
import type { KVStore } from '@nangohq/kvstore';
import type { MessageRow } from '@nangohq/types';

export const logger = getLogger('logs');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

let kvstorePromise: Promise<KVStore> | undefined;
export async function getKVStore(): Promise<KVStore> {
    if (!kvstorePromise) {
        kvstorePromise = createKVStore();
        return await kvstorePromise;
    }

    return await kvstorePromise;
}

export async function destroyLogsKVStore() {
    logger.info('Killing KVStore...');
    if (kvstorePromise) {
        await (await kvstorePromise)?.destroy();
    }
    kvstorePromise = undefined;
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
        return null;
    }

    const err = { name: 'Unknown Error', message: 'unknown error', ...errorToObject(error) };
    return {
        name: error instanceof Error ? error.constructor.name : err.name,
        message: err.message,
        type: 'type' in err ? (err.type as string) : null,
        payload: 'payload' in err ? err.payload : null
    };
}

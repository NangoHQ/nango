import { errorToObject, getLogger } from '@nangohq/utils';
import type { MessageRow } from '@nangohq/types';
import { client } from './es/client.js';

export const logger = getLogger('logs');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

export async function destroy() {
    logger.info('Destroying logs...');
    await client.close();
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

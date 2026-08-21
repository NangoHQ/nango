import { errors as esErrors } from '@elastic/elasticsearch';
import { errors as osErrors } from '@opensearch-project/opensearch';

import { getLogger } from '@nangohq/utils';

import { client } from './storage/client.js';

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

/** @deprecated Prefer `isLogsNotFoundError` — works for both Elasticsearch and OpenSearch clients. */
export const ResponseError = esErrors.ResponseError;

export class LogsNotFoundError extends Error {
    constructor() {
        super('Logs document not found');
        this.name = 'LogsNotFoundError';
    }
}

export class LogsDisabledError extends Error {
    constructor() {
        super('Nango logs are disabled');
        this.name = 'LogsDisabledError';
    }
}

export function isLogsNotFoundError(err: unknown): boolean {
    if (err instanceof LogsNotFoundError) {
        return true;
    }
    if (err instanceof esErrors.ResponseError) {
        return err.statusCode === 404;
    }
    if (err instanceof osErrors.ResponseError) {
        return err.statusCode === 404;
    }
    return false;
}

export function throwLogsNotFound(): never {
    throw new LogsNotFoundError();
}

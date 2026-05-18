import { errors as esErrors } from '@elastic/elasticsearch';
import { errors as osErrors } from '@opensearch-project/opensearch';

import { getLogger } from '@nangohq/utils';

import { envs } from './env.js';
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

export function isLogsNotFoundError(err: unknown): boolean {
    if (err instanceof esErrors.ResponseError) {
        return err.statusCode === 404;
    }
    if (err instanceof osErrors.ResponseError) {
        return err.statusCode === 404;
    }
    return false;
}

export function throwLogsNotFound(): never {
    if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
        throw new osErrors.ResponseError({
            statusCode: 404,
            body: {},
            headers: {},
            warnings: null
        } as any);
    }

    throw new esErrors.ResponseError({
        statusCode: 404,
        warnings: [],
        body: {},
        headers: {}
    } as any);
}

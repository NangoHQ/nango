import { getLogger } from '@nangohq/utils';

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

import { getLogger } from '@nangohq/utils';

// Try to satisfies CLI pack
export type { Logger } from 'winston';

export const logger = getLogger('elasticsearch');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

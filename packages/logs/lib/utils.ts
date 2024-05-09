import { getLogger } from '@nangohq/utils';

export const logger = getLogger('opensearch');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

import { getLogger } from '@nangohq/utils';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck bundleDependencies issue
export const logger = getLogger('elasticsearch');

export const isCli = process.argv.find((value) => value.includes('/bin/nango') || value.includes('cli/dist/index'));

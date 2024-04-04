import { customAlphabet } from 'nanoid';
import { getLogger } from '@nangohq/utils';

export const logger = getLogger('elasticsearch');

/**
 * Nanoid without special char to use in URLs
 */
export const alphabet = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
export const minSize = 8;
export const maxSize = 20;
export const nanoid = customAlphabet(alphabet, maxSize);

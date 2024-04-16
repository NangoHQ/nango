import { customAlphabet } from 'nanoid';

/**
 * Nanoid without special char to use in URLs
 */
export const alphabet = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
export const maxSize = 20;
export const nanoid = customAlphabet(alphabet, maxSize);

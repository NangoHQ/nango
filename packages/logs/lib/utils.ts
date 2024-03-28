import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { getLogger } from '@nangohq/utils/dist/logger.js';
import { envErrorToString } from '@nangohq/utils/dist/environment/helpers.js';

export const logger = getLogger('elasticsearch');

export function initLogsEnv() {
    const schema = z.object({
        NANGO_LOGS_ES_URL: z.string().url(),
        NANGO_LOGS_ES_USER: z.string(),
        NANGO_LOGS_ES_PWD: z.string()
    });

    const res = schema.safeParse(process.env);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${envErrorToString(res.error.issues)}`);
    }

    return res.data;
}

/**
 * Nanoid without special char to use in URLs
 */
export const alphabet = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
export const minSize = 8;
export const maxSize = 20;
export const nanoid = customAlphabet(alphabet, maxSize);

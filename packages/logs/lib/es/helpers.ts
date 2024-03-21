import { client } from './client.js';
import { indices } from './schema.js';
import { logger } from '@nangohq/shared';
import { customAlphabet } from 'nanoid';

export async function migrateMapping() {
    try {
        await Promise.all(
            indices.map((index) => {
                return client.indices.create(index, { ignore: [400] });
            })
        );
    } catch (err) {
        logger.error(err);
        throw new Error('failed_to_init_elasticsearch');
    }
}

export const alphabet = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
export const minSize = 8;
export const maxSize = 20;
export const nanoid = customAlphabet(alphabet, maxSize);

import { beforeAll, describe, expect, it } from 'vitest';
import { migrateMapping } from './helpers.js';
import { client } from './client.js';
import { indexMessages } from './schema.js';
import { nanoid } from '../utils.js';

describe('mapping', () => {
    beforeAll(async () => {
        indexMessages.index = `messages-${nanoid()}`.toLocaleLowerCase();
        await client.indices.create({
            index: indexMessages.index
        });
    });

    it('should apply mapping', async () => {
        const mappingBefore = await client.indices.getMapping({
            index: indexMessages.index
        });
        expect(mappingBefore[indexMessages.index]).toStrictEqual({ mappings: {} });

        await migrateMapping();

        const mappingAfter = await client.indices.getMapping({
            index: indexMessages.index
        });
        expect(mappingAfter[indexMessages.index]?.mappings).toMatchSnapshot();
    });
});

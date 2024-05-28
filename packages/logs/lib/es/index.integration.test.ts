import { beforeAll, describe, expect, it } from 'vitest';
import { migrateMapping } from './helpers.js';
import { client } from './client.js';
import { indexMessages } from './schema.js';
import { nanoid } from '@nangohq/utils';
import { logContextGetter } from '../models/logContextGetter.js';
import { getOperation } from '../models/messages.js';

// This file is sequential
describe('mapping', () => {
    const today = new Date().toISOString().split('T')[0];
    let fullIndexName: string;
    beforeAll(async () => {
        indexMessages.index = `messages-${nanoid()}`.toLocaleLowerCase();
        fullIndexName = `${indexMessages.index}.${today}`;
    });

    it('should not have an index before migration', async () => {
        await expect(
            client.indices.getMapping({
                index: fullIndexName
            })
        ).rejects.toThrow();
    });

    it('should migrate', async () => {
        await migrateMapping();
    });

    it('should not have create any index', async () => {
        await expect(
            client.indices.getMapping({
                index: indexMessages.index
            })
        ).rejects.toThrow();
    });

    it('should not have create any index', async () => {
        await expect(
            client.indices.getMapping({
                index: indexMessages.index
            })
        ).rejects.toThrow();

        await expect(
            client.indices.getMapping({
                index: fullIndexName
            })
        ).rejects.toThrow();
    });

    it('should create one index automatically on log', async () => {
        // Log to automatically create an index
        await logContextGetter.create({ message: 'hello', operation: { type: 'action' } }, { account: { id: 1, name: '' }, environment: { id: 1, name: '' } });

        // Should have created a today index
        const mapping = await client.indices.getMapping({
            index: fullIndexName
        });
        expect(mapping[fullIndexName]).toMatchSnapshot();

        const settings = await client.indices.getSettings({
            index: fullIndexName
        });
        expect(settings[fullIndexName]?.settings?.index?.analysis).toMatchSnapshot();
        expect(settings[fullIndexName]?.settings?.index?.sort).toMatchSnapshot();
        expect(settings[fullIndexName]?.settings?.index?.lifecycle).toMatchSnapshot();
    });

    it('should create yesterday index automatically', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIndexName = `${indexMessages.index}.${yesterday.toISOString().split('T')[0]}`;

        // Log to automatically create an index
        const ctx = await logContextGetter.create(
            { message: 'hello', operation: { type: 'action' }, createdAt: yesterday.toISOString() },
            { account: { id: 1, name: '' }, environment: { id: 1, name: '' } }
        );
        await ctx.failed();

        // Should have created a today index
        await client.indices.getMapping({
            index: yesterdayIndexName
        });
        const doc = await getOperation({ id: ctx.id });
        expect(doc.state).toBe('failed');
    });
});

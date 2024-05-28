import { beforeAll, describe, expect, it } from 'vitest';
import { deleteIndex, migrateMapping } from './helpers.js';
import { client } from './client.js';
import { indexMessages } from './schema.js';
import { nanoid } from '@nangohq/utils';
import { createMessage, getOperation, update } from '../models/messages.js';
import { getFormattedMessage } from '../models/helpers.js';

// This file is sequential
describe('mapping', () => {
    const today = new Date().toISOString().split('T')[0];
    let fullIndexName: string;
    beforeAll(async () => {
        indexMessages.index = `messages-${nanoid()}`.toLocaleLowerCase();
        fullIndexName = `${indexMessages.index}.${today}`;

        // Delete before otherwise it's hard to debug
        await deleteIndex();
    });

    it('should not have an index before migration', async () => {
        await expect(client.indices.getMapping({ index: fullIndexName })).rejects.toThrow();
    });

    it('should migrate', async () => {
        await migrateMapping();
    });

    it('should not have create any index', async () => {
        await expect(client.indices.getMapping({ index: indexMessages.index })).rejects.toThrow();
    });

    it('should not have create any index', async () => {
        await expect(client.indices.getMapping({ index: indexMessages.index })).rejects.toThrow();

        await expect(client.indices.getMapping({ index: fullIndexName })).rejects.toThrow();
    });

    it('should create one index automatically on log', async () => {
        const today = new Date();
        // Log to automatically create an index
        const id = nanoid();
        await createMessage(getFormattedMessage({ id, message: 'hello', operation: { type: 'action' }, createdAt: today.toISOString() }));
        await update({ id, data: { state: 'failed', createdAt: today.toISOString() } });

        // Should have created a today index
        const mapping = await client.indices.getMapping({ index: fullIndexName });
        expect(mapping[fullIndexName]).toMatchSnapshot();

        const settings = await client.indices.getSettings({ index: fullIndexName });
        expect(settings[fullIndexName]?.settings?.index?.analysis).toMatchSnapshot();
        expect(settings[fullIndexName]?.settings?.index?.sort).toMatchSnapshot();
        expect(settings[fullIndexName]?.settings?.index?.lifecycle).toMatchSnapshot();
    });

    it('should create yesterday index automatically', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIndexName = `${indexMessages.index}.${yesterday.toISOString().split('T')[0]}`;

        // Log to automatically create an index
        const id = nanoid();
        await createMessage(getFormattedMessage({ id, message: 'hello', operation: { type: 'action' }, createdAt: yesterday.toISOString() }));
        await update({ id, data: { state: 'failed', createdAt: yesterday.toISOString() } });

        // Should have created a yesterday index
        await client.indices.getMapping({ index: yesterdayIndexName });
        const doc = await getOperation({ id });
        expect(doc.state).toBe('failed');
    });
});

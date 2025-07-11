import { beforeAll, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { client } from './client.js';
import { deleteIndex, migrateMapping } from './helpers.js';
import { indexMessages } from './schema.js';
import { getFormattedOperation } from '../models/helpers.js';
import { createOperation, getOperation, updateOperation } from '../models/messages.js';

// This file is sequential
describe('mapping', () => {
    const today = new Date().toISOString().split('T')[0];
    let fullIndexName: string;
    beforeAll(async () => {
        indexMessages.index = `index-messages-${nanoid()}`.toLocaleLowerCase();
        fullIndexName = `${indexMessages.index}.${today}`;

        // Delete before otherwise it's hard to debug
        await deleteIndex({ prefix: 'index-messages' });
    });

    it('should not have an index before migration', async () => {
        await expect(client.indices.getMapping({ index: fullIndexName })).rejects.toThrow();
    });

    it('should migrate', async () => {
        await migrateMapping();
    });

    it('should have create index and alias', async () => {
        await client.indices.getMapping({ index: indexMessages.index });

        await client.indices.getMapping({ index: fullIndexName });
    });

    it('should create one index automatically on log', async () => {
        const today = new Date();
        // Log to automatically create an index
        const id = nanoid();
        await createOperation(getFormattedOperation({ id, operation: { type: 'action', action: 'run' }, createdAt: today.toISOString() }));
        await updateOperation({ id, data: { state: 'failed', createdAt: today.toISOString() } });

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
        await createOperation(getFormattedOperation({ id, operation: { type: 'action', action: 'run' }, createdAt: yesterday.toISOString() }));
        await updateOperation({ id, data: { state: 'failed', createdAt: yesterday.toISOString() } });

        // Should have created a yesterday index
        await client.indices.getMapping({ index: yesterdayIndexName });
        const doc = await getOperation({ id });
        expect(doc.state).toBe('failed');
    });
});

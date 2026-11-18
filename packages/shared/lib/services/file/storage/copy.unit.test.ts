import { describe, expect, it, vi } from 'vitest';

import { copyObject } from './copy.js';

import type { ObjectStore } from './types.js';

function memoryStore(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));
    const put = vi.fn((key: string, content: string) => {
        files.set(key, content);
        return Promise.resolve();
    });
    const copy = vi.fn((sourceKey: string, destinationKey: string) => {
        const content = files.get(sourceKey);
        if (content === undefined) {
            return Promise.reject(new Error(`missing ${sourceKey}`));
        }
        files.set(destinationKey, content);
        return Promise.resolve();
    });
    const store: ObjectStore = {
        put,
        copy,
        get: (key: string) => {
            const content = files.get(key);
            return content === undefined ? Promise.reject(new Error(`missing ${key}`)) : Promise.resolve(content);
        },
        getStream: () => Promise.resolve(null),
        delete: () => Promise.resolve(),
        hasSameContent: () => Promise.resolve(false)
    };
    return { store, files, put, copy };
}

describe(copyObject, () => {
    it('copies server-side within one store', async () => {
        const { store, files, put, copy } = memoryStore({ 'templates-zero/a.cjs': 'code' });

        await copyObject({ from: store, to: store, sourceKey: 'templates-zero/a.cjs', destinationKey: 'dev/account/1/a.js' });

        expect(copy).toHaveBeenCalledWith('templates-zero/a.cjs', 'dev/account/1/a.js');
        expect(put).not.toHaveBeenCalled();
        expect(files.get('dev/account/1/a.js')).toBe('code');
    });

    it('reads from one store and writes to the other across stores', async () => {
        const templates = memoryStore({ 'templates-zero/a.cjs': 'code' });
        const integrations = memoryStore();

        await copyObject({ from: templates.store, to: integrations.store, sourceKey: 'templates-zero/a.cjs', destinationKey: 'dev/account/1/a.js' });

        expect(templates.copy).not.toHaveBeenCalled();
        expect(integrations.files.get('dev/account/1/a.js')).toBe('code');
        expect(templates.files.has('dev/account/1/a.js')).toBe(false);
    });

    it('fails without writing when the source is missing', async () => {
        const templates = memoryStore();
        const integrations = memoryStore();

        await expect(
            copyObject({ from: templates.store, to: integrations.store, sourceKey: 'templates-zero/missing.cjs', destinationKey: 'dev/a.js' })
        ).rejects.toThrow('missing templates-zero/missing.cjs');
        expect(integrations.put).not.toHaveBeenCalled();
    });
});

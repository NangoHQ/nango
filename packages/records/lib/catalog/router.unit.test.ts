import { describe, expect, it, vi } from 'vitest';

import { RecordsRouter } from './router.js';

import type { RecordsStore } from '../store.js';

describe('RecordsRouter', () => {
    it('dispatches upsert and getRecords to the same store', async () => {
        const upsert = vi.fn().mockResolvedValue({
            ok: true,
            value: { addedKeys: ['1'], updatedKeys: [], unchangedKeys: [], nonUniqueKeys: [], activatedKeys: [], nextMerging: { strategy: 'override' } }
        });
        const getRecords = vi.fn().mockResolvedValue({ ok: true, value: { records: [], next_cursor: null } });
        const store = { upsert, getRecords } as unknown as RecordsStore;
        const router = new RecordsRouter(store);

        await router.upsert({ records: [], connectionId: 1, environmentId: 1, model: 'foo' });
        await router.getRecords({ connectionId: 1, model: 'foo' });

        expect(upsert).toHaveBeenCalledOnce();
        expect(getRecords).toHaveBeenCalledOnce();
    });
});

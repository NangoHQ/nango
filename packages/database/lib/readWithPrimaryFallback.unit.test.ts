import { describe, expect, it, vi } from 'vitest';

import { KnexDatabase } from './index.js';

import type { Knex } from 'knex';

const replica = { name: 'replica' } as unknown as Knex;
const primary = { name: 'primary' } as unknown as Knex;

function run<T>(dbs: { readOnly: Knex; knex: Knex }, query: (knex: Knex) => Promise<T | null | undefined>) {
    return KnexDatabase.prototype.readWithPrimaryFallback.call(dbs, query);
}

describe('readWithPrimaryFallback', () => {
    it('returns the replica row without touching the primary', async () => {
        const query = vi.fn((knex: Knex) => Promise.resolve(knex === replica ? 'row' : undefined));

        await expect(run({ readOnly: replica, knex: primary }, query)).resolves.toBe('row');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('retries on the primary when the replica misses', async () => {
        const query = vi.fn((knex: Knex) => Promise.resolve(knex === primary ? 'row' : undefined));

        await expect(run({ readOnly: replica, knex: primary }, query)).resolves.toBe('row');
        expect(query).toHaveBeenNthCalledWith(2, primary);
    });

    it('returns null when neither has the row', async () => {
        const query = vi.fn(() => Promise.resolve(null));

        await expect(run({ readOnly: replica, knex: primary }, query)).resolves.toBeNull();
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('queries once when there is no separate replica', async () => {
        const query = vi.fn(() => Promise.resolve(undefined));

        await expect(run({ readOnly: primary, knex: primary }, query)).resolves.toBeNull();
        expect(query).toHaveBeenCalledTimes(1);
    });
});

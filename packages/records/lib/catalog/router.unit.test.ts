import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { RecordsRouter, Routing } from './router.js';

import type { RecordsStore } from '../store.js';
import type { RecordCount } from '../types.js';
import type { DBPlan } from '@nangohq/types';

type StoreKey = 'a' | 'b';

const plan = { id: 1, account_id: 1 } as unknown as DBPlan;
const routeToA = new Routing<StoreKey>(() => 'a');

function makeStore(overrides: Partial<RecordsStore> = {}): RecordsStore {
    return overrides as unknown as RecordsStore;
}

describe('RecordsRouter', () => {
    describe('lifecycle ops', () => {
        it('migrate calls every store', async () => {
            const migrateA = vi.fn().mockResolvedValue(undefined);
            const migrateB = vi.fn().mockResolvedValue(undefined);
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ migrate: migrateA }), b: makeStore({ migrate: migrateB }) },
                routing: routeToA
            });

            await router.migrate();

            expect(migrateA).toHaveBeenCalledOnce();
            expect(migrateB).toHaveBeenCalledOnce();
        });

        it('close calls every store', async () => {
            const closeA = vi.fn().mockResolvedValue(undefined);
            const closeB = vi.fn().mockResolvedValue(undefined);
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ close: closeA }), b: makeStore({ close: closeB }) },
                routing: routeToA
            });

            await router.close();

            expect(closeA).toHaveBeenCalledOnce();
            expect(closeB).toHaveBeenCalledOnce();
        });

        it('startDaemons calls every store', () => {
            const startDaemonsA = vi.fn();
            const startDaemonsB = vi.fn();
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ startDaemons: startDaemonsA }), b: makeStore({ startDaemons: startDaemonsB }) },
                routing: routeToA
            });

            router.startDaemons();

            expect(startDaemonsA).toHaveBeenCalledOnce();
            expect(startDaemonsB).toHaveBeenCalledOnce();
        });
    });

    describe('dataset ops', () => {
        it('routing dispatches to different stores based on context', async () => {
            const upsertA = vi
                .fn()
                .mockResolvedValue(
                    Ok({ addedKeys: [], updatedKeys: [], unchangedKeys: [], nonUniqueKeys: [], activatedKeys: [], nextMerging: { strategy: 'override' } })
                );
            const upsertB = vi
                .fn()
                .mockResolvedValue(
                    Ok({ addedKeys: [], updatedKeys: [], unchangedKeys: [], nonUniqueKeys: [], activatedKeys: [], nextMerging: { strategy: 'override' } })
                );
            const routing = new Routing<StoreKey>((ctx) => (ctx.connectionId === 1 ? 'a' : 'b'));
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ upsert: upsertA }), b: makeStore({ upsert: upsertB }) },
                routing
            });

            await router.upsert({ plan, records: [], connectionId: 1, environmentId: 1, model: 'foo' });
            expect(upsertA).toHaveBeenCalledOnce();
            expect(upsertB).not.toHaveBeenCalled();

            // reset mocks before next call
            upsertA.mockClear();
            upsertB.mockClear();

            await router.upsert({ plan, records: [], connectionId: 2, environmentId: 1, model: 'foo' });
            expect(upsertA).not.toHaveBeenCalled();
            expect(upsertB).toHaveBeenCalledOnce();
        });
    });

    describe('aggregation ops', () => {
        const makeCount = (model: string): RecordCount => {
            return { model, connection_id: 1, environment_id: 1, count: 1, size_bytes: 0, updated_at: '2024-01-01', autodelete_checked_at: null };
        };
        it('getCountsByModel merges results from all stores', async () => {
            const countA = makeCount('contact');
            const countB = makeCount('deal');
            const router = new RecordsRouter<StoreKey>({
                stores: {
                    a: makeStore({ getCountsByModel: vi.fn().mockResolvedValue(Ok({ contact: countA })) }),
                    b: makeStore({ getCountsByModel: vi.fn().mockResolvedValue(Ok({ deal: countB })) })
                },
                routing: routeToA
            });

            const result = await router.getCountsByModel({ connectionId: 1, environmentId: 1 });

            expect(result.isErr()).toBe(false);
            expect(result.unwrap()).toEqual({ contact: countA, deal: countB });
        });

        it('getCountsByModel returns error if any store fails', async () => {
            const error = new Error('store failure');
            const router = new RecordsRouter<StoreKey>({
                stores: {
                    a: makeStore({ getCountsByModel: vi.fn().mockResolvedValue(Err(error)) }),
                    b: makeStore({ getCountsByModel: vi.fn().mockResolvedValue(Ok({ deal: makeCount('deal') })) })
                },
                routing: routeToA
            });

            const result = await router.getCountsByModel({ connectionId: 1, environmentId: 1 });

            expect(result.isErr()).toBe(true);
        });

        it('paginateCounts yields from all stores in sequence', async () => {
            const batchA: RecordCount[] = [makeCount('contact')];
            const batchB: RecordCount[] = [makeCount('deal')];

            const router = new RecordsRouter<StoreKey>({
                stores: {
                    a: makeStore({
                        paginateCounts: () =>
                            // eslint-disable-next-line @typescript-eslint/require-await
                            (async function* () {
                                yield Ok(batchA);
                            })()
                    }),
                    b: makeStore({
                        paginateCounts: () =>
                            // eslint-disable-next-line @typescript-eslint/require-await
                            (async function* () {
                                yield Ok(batchB);
                            })()
                    })
                },
                routing: routeToA
            });

            const batches: RecordCount[][] = [];
            for await (const result of router.paginateCounts()) {
                expect(result.isErr()).toBe(false);
                batches.push(result.unwrap());
            }

            expect(batches).toEqual([batchA, batchB]);
        });
    });

    describe('candidate ops', () => {
        it('autoPruningCandidate calls exactly one store', async () => {
            const candidateA = vi.fn().mockResolvedValue(Ok(null));
            const candidateB = vi.fn().mockResolvedValue(Ok(null));
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ autoPruningCandidate: candidateA }), b: makeStore({ autoPruningCandidate: candidateB }) },
                routing: routeToA
            });

            await router.autoPruningCandidate({ staleAfterMs: 1000 });

            expect(candidateA.mock.calls.length + candidateB.mock.calls.length).toBe(1);
        });

        it('autoDeletingCandidate calls exactly one store', async () => {
            const candidateA = vi.fn().mockResolvedValue(Ok(null));
            const candidateB = vi.fn().mockResolvedValue(Ok(null));
            const router = new RecordsRouter<StoreKey>({
                stores: { a: makeStore({ autoDeletingCandidate: candidateA }), b: makeStore({ autoDeletingCandidate: candidateB }) },
                routing: routeToA
            });

            await router.autoDeletingCandidate({ staleAfterMs: 1000 });

            expect(candidateA.mock.calls.length + candidateB.mock.calls.length).toBe(1);
        });
    });
});

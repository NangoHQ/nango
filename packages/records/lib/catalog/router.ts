import { Ok, flagHasPlan } from '@nangohq/utils';

import { defaultStore } from './default.js';
import { secondaryStore } from './secondary.js';

import type { RecordsStore } from '../store.js';
import type { RecordCount } from '../types.js';
import type { DBPlan } from '@nangohq/types';

// Augments a store method signature with a plan parameter for routing purposes.
type Routed<F> = F extends (params: infer P) => infer R ? (params: P & { plan: DBPlan | null }) => R : never;

type RoutedRecordsStore = Omit<RecordsStore, 'getRecords' | 'getCursor' | 'upsert' | 'update' | 'deleteRecords' | 'deleteOutdatedRecords'> & {
    getRecords: Routed<RecordsStore['getRecords']>;
    getCursor: Routed<RecordsStore['getCursor']>;
    upsert: Routed<RecordsStore['upsert']>;
    update: Routed<RecordsStore['update']>;
    deleteRecords: Routed<RecordsStore['deleteRecords']>;
    deleteOutdatedRecords: Routed<RecordsStore['deleteOutdatedRecords']>;
};

interface RoutingContext {
    plan: DBPlan | null;
    connectionId: number;
    model: string;
}

export class RecordsRouter<K extends string> implements RoutedRecordsStore {
    private readonly stores: Map<K, RecordsStore>;
    private readonly routing: Routing<K>;

    constructor({ stores, routing }: { stores: Record<K, RecordsStore | undefined>; routing: Routing<K> }) {
        this.stores = new Map(Object.entries(stores).filter(([_, v]) => v !== undefined) as [K, RecordsStore][]);
        this.routing = routing;
    }

    private async resolve(ctx: RoutingContext): Promise<RecordsStore> {
        const key = await this.routing.get(ctx);
        return this.stores.get(key)!;
    }

    private random(): RecordsStore {
        return Array.from(this.stores.values())[Math.floor(Math.random() * this.stores.size)]!;
    }

    // Lifecycle: runs against all stores
    migrate: RecordsStore['migrate'] = async () => {
        await Promise.allSettled([...this.stores.values()].map((s) => s.migrate()));
    };
    close: RecordsStore['close'] = async () => {
        await Promise.allSettled([...this.stores.values()].map((s) => s.close()));
    };
    startDaemons: RecordsStore['startDaemons'] = () => {
        for (const store of this.stores.values()) store.startDaemons();
    };

    // Dataset ops: routed to a specific store
    getRecords: Routed<RecordsStore['getRecords']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).getRecords(params);

    getCursor: Routed<RecordsStore['getCursor']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).getCursor(params);

    upsert: Routed<RecordsStore['upsert']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).upsert(params);

    update: Routed<RecordsStore['update']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).update(params);

    deleteRecords: Routed<RecordsStore['deleteRecords']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).deleteRecords(params);

    deleteOutdatedRecords: Routed<RecordsStore['deleteOutdatedRecords']> = async ({ plan, ...params }) =>
        (await this.resolve({ plan, connectionId: params.connectionId, model: params.model })).deleteOutdatedRecords(params);

    // Aggregation ops: fan-out across stores
    getCountsByModel: RecordsStore['getCountsByModel'] = async (params) => {
        const results = await Promise.all([...this.stores.values()].map((s) => s.getCountsByModel(params)));
        const agg: Record<string, RecordCount> = {};
        for (const result of results) {
            if (result.isErr()) return result;
            // Assumes disjoint key spaces across stores
            // routing must ensure a given records dataset is always assigned to the same store,
            // so the same model key will never appear in two stores.
            Object.assign(agg, result.value);
        }
        return Ok(agg);
    };
    paginateCounts: RecordsStore['paginateCounts'] = (params) => {
        const stores = this.stores.values();
        return (async function* () {
            for (const store of stores) {
                yield* store.paginateCounts(params);
            }
        })();
    };

    // Candidate ops: pick a random store
    autoPruningCandidate: RecordsStore['autoPruningCandidate'] = (params) => this.random().autoPruningCandidate(params);
    autoDeletingCandidate: RecordsStore['autoDeletingCandidate'] = (params) => this.random().autoDeletingCandidate(params);
}

export class Routing<K extends string> {
    constructor(private readonly routing: (ctx: RoutingContext) => Promise<K>) {}

    public get(ctx: RoutingContext): Promise<K> {
        return this.routing(ctx);
    }
}

const stores = {
    default: defaultStore,
    secondary: secondaryStore
};
// The routing store is the one responsible for persisting the routing decisions for each connection/model.
// For simplicity, we use the default store, but it could be a separate store or an external service.
const routingStore = defaultStore;

// Routing is fixed and deterministic based on the routing context.
// It must not change across calls for a given context. (ie: Rebalancing and moving data between stores is not supported)
const routingCache = new Map<string, keyof typeof stores>();
const routing = new Routing(async (ctx: RoutingContext) => {
    // Skip routing entirely when secondary store is not configured or feature flag is off
    if (!flagHasPlan || !stores.secondary) return 'default';

    const cacheKey = `${ctx.connectionId}:${ctx.model}`;
    const cached = routingCache.get(cacheKey);
    if (cached) return cached;

    const storeKey = ctx.plan?.records_store || 'default';

    // Persist the assignment on first access; existing records are returned unchanged
    const res = await routingStore.getOrCreateRouting({ connectionId: ctx.connectionId, model: ctx.model, storeKey, ifExists: 'default' });

    // Ensure the assigned store exists, otherwise fallback to default
    const resolved = res.isOk() && stores[res.value] ? res.value : 'default';
    routingCache.set(cacheKey, resolved);
    return resolved;
});

export const records = new RecordsRouter({ stores, routing });

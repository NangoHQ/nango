import { Ok } from '@nangohq/utils';

import { defaultStore } from './default.js';

import type { RecordsStore } from '../store.js';
import type { RecordCount } from '../types.js';
import type { DBPlan } from '@nangohq/types';

// Augments a store method signature with an optional plan parameter for routing purposes.
type Routed<F> = F extends (params: infer P) => infer R ? (params: P & { plan?: DBPlan }) => R : never;

interface RoutingContext {
    plan?: DBPlan | undefined;
    connectionId: number;
    model: string;
}

export class RecordsRouter<K extends string> implements RecordsStore {
    private readonly stores: Map<K, RecordsStore>;
    private readonly routing: Routing<K>;

    constructor({ stores, routing }: { stores: Record<K, RecordsStore>; routing: Routing<K> }) {
        this.stores = new Map(Object.entries(stores) as [K, RecordsStore][]);
        this.routing = routing;
    }

    private resolve(ctx: RoutingContext): RecordsStore {
        return this.stores.get(this.routing.get(ctx))!;
    }

    private random(): RecordsStore {
        return Array.from(this.stores.values())[Math.floor(Math.random() * this.stores.size)]!;
    }

    // Lifecycle: runs against all stores
    migrate: RecordsStore['migrate'] = async () => {
        await Promise.all([...this.stores.values()].map((s) => s.migrate()));
    };
    close: RecordsStore['close'] = async () => {
        await Promise.all([...this.stores.values()].map((s) => s.close()));
    };
    startDaemons: RecordsStore['startDaemons'] = () => {
        for (const store of this.stores.values()) store.startDaemons();
    };

    // Dataset ops: routed to a specific store
    getRecords: Routed<RecordsStore['getRecords']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).getRecords(params);

    getCursor: Routed<RecordsStore['getCursor']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).getCursor(params);

    upsert: Routed<RecordsStore['upsert']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).upsert(params);

    update: Routed<RecordsStore['update']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).update(params);

    deleteRecords: Routed<RecordsStore['deleteRecords']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).deleteRecords(params);

    deleteOutdatedRecords: Routed<RecordsStore['deleteOutdatedRecords']> = ({ plan, ...params }) =>
        this.resolve({ plan, connectionId: params.connectionId, model: params.model }).deleteOutdatedRecords(params);

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
    constructor(private readonly routing: (ctx: RoutingContext) => K) {}

    public get(ctx: RoutingContext): K {
        return this.routing(ctx);
    }
}

// Routing is fixed and deterministic based on the routing context.
// It must not change across calls for a given context. (ie: Rebalancing and moving data between stores is not supported)
const routing = new Routing((_ctx: RoutingContext) => {
    // For now we have a single store, so we can ignore the context and always assign/return the default store
    // In the future, this can be extended to route based on connectionId, model, plan, account, etc.
    // and routing decisions can be stored in a database
    return 'default';
});
const stores = { default: defaultStore };

export const records = new RecordsRouter({ stores, routing });

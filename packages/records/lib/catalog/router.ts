import { defaultStore } from './default.js';

import type { RecordsStore } from '../store.js';

export class RecordsRouter implements RecordsStore {
    private readonly store: RecordsStore;

    constructor(store: RecordsStore) {
        this.store = store;
    }

    private resolve(): RecordsStore {
        return this.store;
    }

    migrate: RecordsStore['migrate'] = () => this.resolve().migrate();
    close: RecordsStore['close'] = () => this.resolve().close();
    startDaemons: RecordsStore['startDaemons'] = () => this.resolve().startDaemons();
    getRecords: RecordsStore['getRecords'] = (params) => this.resolve().getRecords(params);
    getCursor: RecordsStore['getCursor'] = (params) => this.resolve().getCursor(params);
    upsert: RecordsStore['upsert'] = (params) => this.resolve().upsert(params);
    update: RecordsStore['update'] = (params) => this.resolve().update(params);
    deleteRecords: RecordsStore['deleteRecords'] = (params) => this.resolve().deleteRecords(params);
    deleteOutdatedRecords: RecordsStore['deleteOutdatedRecords'] = (params) => this.resolve().deleteOutdatedRecords(params);
    getCountsByModel: RecordsStore['getCountsByModel'] = (params) => this.resolve().getCountsByModel(params);
    paginateCounts: RecordsStore['paginateCounts'] = (params) => this.resolve().paginateCounts(params);
    autoPruningCandidate: RecordsStore['autoPruningCandidate'] = (params) => this.resolve().autoPruningCandidate(params);
    autoDeletingCandidate: RecordsStore['autoDeletingCandidate'] = (params) => this.resolve().autoDeletingCandidate(params);
}

export const records = new RecordsRouter(defaultStore);

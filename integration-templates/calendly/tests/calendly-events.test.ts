import { vi, expect, it, describe } from 'vitest';
import type { NangoSync } from '../models.js';

import fetchData from '../syncs/events.js';

let batchSaveData: any = null;

const { default: batchSaveDataRaw } = await import(`../mocks/events/batchSave.json`);
batchSaveData = batchSaveDataRaw;

let batchDeleteData: any = null;

const { default: batchDeleteDataRaw } = await import(`../mocks/events/batchDelete.json`);
batchDeleteData = batchDeleteDataRaw;

let getConnection: null | unknown = null;

const { default: getConnectionData } = await import('../mocks/nango/getConnection.json', { assert: { type: 'json' } });
getConnection = getConnectionData;

let paginateGet = false;

paginateGet = true;

let paginatePost = false;

let paginatePatch = false;

let paginatePut = false;

let paginateDelete = false;

describe('calendly events tests', () => {
    const nangoMock = {
        lastSyncDate: null,
        log: vi.fn()
    } as unknown as NangoSync;

    if (batchSaveData) {
        nangoMock.batchSave = vi.fn().mockReturnValue(batchSaveData) as NangoSync['batchSave'];
    }

    if (batchDeleteData) {
        nangoMock.batchDelete = vi.fn().mockReturnValue(batchDeleteData) as NangoSync['batchDelete'];
    }

    if (getConnection) {
        nangoMock.getConnection = vi.fn().mockReturnValue(getConnection) as NangoSync['getConnection'];
    }

    if (paginateGet || paginatePost || paginatePatch || paginatePut || paginateDelete) {
        nangoMock.paginate = vi.fn().mockImplementation(async function* (args: any) {
            const { endpoint, method = 'GET' } = args;
            switch (method) {
                case 'GET': {
                    const { default: paginateDataGet } = await import(`../mocks/paginate/get/events${endpoint}.json`, { assert: { type: 'json' } });
                    paginateGet = paginateDataGet;
                    yield paginateGet;
                    break;
                }
                case 'POST': {
                    const { default: paginateDataPost } = await import(`../mocks/paginate/post/events${endpoint}.json`, { assert: { type: 'json' } });
                    paginatePost = paginateDataPost;
                    yield paginatePost;
                    break;
                }
                case 'PATCH': {
                    const { default: paginateDataPatch } = await import(`../mocks/paginate/patch/events${endpoint}.json`, { assert: { type: 'json' } });
                    paginatePatch = paginateDataPatch;
                    yield paginatePatch;
                    break;
                }
                case 'PUT': {
                    const { default: paginateDataPut } = await import(`../mocks/paginate/put/events${endpoint}.json`, { assert: { type: 'json' } });
                    paginatePut = paginateDataPut;
                    yield paginatePut;
                    break;
                }
                case 'DELETE': {
                    const { default: paginateDataDelete } = await import(`../mocks/paginate/delete/events${endpoint}.json`, { assert: { type: 'json' } });
                    paginateDelete = paginateDataDelete;
                    yield paginateDelete;
                    break;
                }
            }
        }) as NangoSync['paginate'];
    }

    it('should get, map correctly the data and batchSave the result', async () => {
        await fetchData(nangoMock);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(nangoMock.batchSave).toHaveBeenCalledWith(batchSaveData, 'Event');
    });

    it.runIf(batchDeleteData && batchDeleteData.length > 0)('should get, map correctly the data and batchDelete the result', async () => {
        await fetchData(nangoMock);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(nangoMock.batchDelete).toHaveBeenCalledWith(batchDeleteData, 'Event');
    });
});

import { vi, expect, it, describe } from 'vitest';
import type { NangoSync } from '../models.js';

import fetchData from '../calendly/syncs/event-types.js';

let batchSaveData: any = null;

const { default: batchSaveDataRaw } = await import(`../calendly/mocks/event-types/batchSave.json`);
batchSaveData = batchSaveDataRaw;

let batchDeleteData: any = null;

const { default: batchDeleteDataRaw } = await import(`../calendly/mocks/event-types/batchDelete.json`);
batchDeleteData = batchDeleteDataRaw;

let getConnection: null | unknown = null;

const { default: getConnectionData } = await import('../calendly/mocks/nango/getConnection.json', { assert: { type: 'json' } });
getConnection = getConnectionData;

let paginateGet = false;

paginateGet = true;

let paginatePost = false;

let paginatePatch = false;

let paginatePut = false;

let paginateDelete = false;

describe('calendly event-types tests', () => {
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
                    const { default: paginateDataGet } = await import(`../calendly/mocks/paginate/get/event-types${endpoint}.json`, {
                        assert: { type: 'json' }
                    });
                    paginateGet = paginateDataGet;
                    yield paginateGet;
                    break;
                }
                case 'POST': {
                    const { default: paginateDataPost } = await import(`../calendly/mocks/paginate/post/event-types${endpoint}.json`, {
                        assert: { type: 'json' }
                    });
                    paginatePost = paginateDataPost;
                    yield paginatePost;
                    break;
                }
                case 'PATCH': {
                    const { default: paginateDataPatch } = await import(`../calendly/mocks/paginate/patch/event-types${endpoint}.json`, {
                        assert: { type: 'json' }
                    });
                    paginatePatch = paginateDataPatch;
                    yield paginatePatch;
                    break;
                }
                case 'PUT': {
                    const { default: paginateDataPut } = await import(`../calendly/mocks/paginate/put/event-types${endpoint}.json`, {
                        assert: { type: 'json' }
                    });
                    paginatePut = paginateDataPut;
                    yield paginatePut;
                    break;
                }
                case 'DELETE': {
                    const { default: paginateDataDelete } = await import(`../calendly/mocks/paginate/delete/event-types${endpoint}.json`, {
                        assert: { type: 'json' }
                    });
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
        expect(nangoMock.batchSave).toHaveBeenCalledWith(batchSaveData, 'EventType');
    });

    if (batchDeleteData && batchDeleteData.length > 0) {
        it('should get, map correctly the data and batchDelete the result', async () => {
            await fetchData(nangoMock);

            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(nangoMock.batchDelete).toHaveBeenCalledWith(batchDeleteData, 'EventType');
        });
    }
});

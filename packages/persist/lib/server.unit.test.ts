import { expect, describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { server } from './server.js';
import fetch from 'node-fetch';
import { db, SyncConfig } from '@nangohq/shared';
import mockDb, { QueryDetails } from 'mock-knex';

describe('Persist API', () => {
    const port = 3096;
    const serverUrl = `http://localhost:${port}`;
    let dbTracker: mockDb.Tracker;

    beforeAll(() => {
        server.listen(port);
        mockDb.mock(db.knex);
        dbTracker = mockDb.getTracker();
        dbTracker.install();
    });
    afterAll(() => {
        mockDb.unmock(db.knex);
    });

    beforeEach(() => {
        dbTracker.install();
    });
    afterEach(() => {
        dbTracker.uninstall();
    });

    it('should server /health', async () => {
        const response = await fetch(`${serverUrl}/health`);
        expect(response.status).toEqual(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('should log', async () => {
        dbTracker.on('query', (query) => {
            query.response([{ id: 1 }]);
        });
        const response = await fetch(`${serverUrl}/environment/123/log`, {
            method: 'POST',
            body: JSON.stringify({ activityLogId: 456, level: 'info', msg: 'Hello, world!' }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(201);
    });

    describe('save records', () => {
        it('should error if no records', async () => {
            const response = await fetch(`${serverUrl}/environment/123/connection/456/sync/abc/job/101/records`, {
                method: 'POST',
                body: JSON.stringify({
                    model: 'MyModel',
                    records: [],
                    providerConfigKey: 'provider',
                    connectionId: 'myconn',
                    lastSyncDate: new Date(),
                    trackDeletes: false,
                    softDelete: true
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(400);
            const respBody = (await response.json()) as any[];
            expect(respBody[0]['errors']['issues'][0]['path'][0]).toEqual('records');
            expect(respBody[0]['errors']['issues'][0]['message']).toEqual('Array must contain at least 1 element(s)');
        });

        it('should save records', async () => {
            const model = 'MyModel';
            const records = [
                { id: 1, name: 'r1' },
                { id: 2, name: 'r2' }
            ];
            dbTracker.on('query', DBTracker.persistQueries(model));
            const response = await fetch(`${serverUrl}/environment/123/connection/456/sync/abc/job/101/records`, {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    records: records,
                    providerConfigKey: 'provider',
                    connectionId: 'myconn',
                    activityLogId: 12,
                    lastSyncDate: new Date(),
                    trackDeletes: false
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(201);
        });
    });

    it('should delete records ', async () => {
        const model = 'MyModel';
        const records = [
            { id: 1, name: 'r1' },
            { id: 2, name: 'r2' }
        ];
        dbTracker.on('query', DBTracker.persistQueries(model));
        const response = await fetch(`${serverUrl}/environment/123/connection/456/sync/abc/job/101/records`, {
            method: 'DELETE',
            body: JSON.stringify({
                model,
                records: records,
                providerConfigKey: 'provider',
                connectionId: 'myconn',
                activityLogId: 12,
                lastSyncDate: new Date(),
                trackDeletes: false
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(201);
    });

    it('should update records ', async () => {
        const model = 'MyModel';
        const records = [
            { id: 1, name: 'r1' },
            { id: 2, name: 'r2' }
        ];
        dbTracker.on('query', DBTracker.persistQueries(model));
        const response = await fetch(`${serverUrl}/environment/123/connection/456/sync/abc/job/101/records`, {
            method: 'PUT',
            body: JSON.stringify({
                model,
                records: records,
                providerConfigKey: 'provider',
                connectionId: 'myconn',
                activityLogId: 12,
                lastSyncDate: new Date(),
                trackDeletes: false,
                softDelete: true
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(201);
    });
});

class DBTracker {
    public static persistQueries(model: string) {
        return (query: QueryDetails, step: number) => {
            const steps = [
                () => {
                    query.response({ models: [model] } as SyncConfig);
                },
                () => {
                    query.response([]);
                },
                () => {
                    query.response([]);
                },
                () => {
                    query.response([]);
                },
                () => {
                    query.response([]);
                },
                () => {
                    query.response({ id: 1 });
                },
                () => {
                    query.response([]);
                }
            ];
            steps[step - 1]?.();
        };
    }
}

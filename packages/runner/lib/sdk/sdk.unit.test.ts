/* eslint-disable @typescript-eslint/unbound-method */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Nango } from '@nangohq/node';
import { AbortedSDKError, InvalidRecordSDKError } from '@nangohq/runner-sdk';
import { ProxyRequest } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { Locks } from './locks.js';
import { PersistClient } from './persist.js';
import { NangoActionRunner, NangoSyncRunner } from './sdk.js';

import type { CursorPagination, DBSyncConfig, LinkPagination, NangoProps, OffsetPagination, Pagination, Provider } from '@nangohq/types';
import type { AxiosResponse } from 'axios';

const nangoProps: NangoProps = {
    scriptType: 'sync',
    secretKey: '***',
    providerConfigKey: 'github',
    provider: 'github',
    connectionId: 'connection-1',
    activityLogId: '1',
    team: {
        id: 1,
        name: 'team'
    },
    environmentId: 1,
    environmentName: 'test-env',
    lastSyncDate: new Date(),
    syncConfig: {} as DBSyncConfig,
    syncId: '1',
    syncJobId: 1,
    nangoConnectionId: 1,
    debug: false,
    runnerFlags: {} as any,
    startedAt: new Date(),
    endUser: null,
    heartbeatTimeoutSecs: 30
};

const locks = new Locks();

describe('cache', () => {
    let nangoAction: NangoActionRunner;
    let nango: Nango;

    beforeEach(async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.saveLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        nangoAction = new NangoActionRunner(
            {
                ...nangoProps
            },
            { persistClient, locks }
        );
        nango = new Nango({ secretKey: '***' });
        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
        nodeClient.prototype.setMetadata = vi.fn().mockReturnValue({});
        nodeClient.prototype.getIntegration = vi.fn().mockReturnValue({ data: { provider: 'github' } });
        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockImplementation(() => Promise.resolve({} as AxiosResponse));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Proxy', () => {
        it('memoizes connection', async () => {
            await nangoAction.proxy({ endpoint: '/issues' });
            await nangoAction.proxy({ endpoint: '/issues' });
            expect(nango.getConnection).toHaveBeenCalledTimes(1);
        });

        it('get connection if memoized connection is too old', async () => {
            await nangoAction.proxy({ endpoint: '/issues' });
            const later = Date.now() + 61000;
            vi.spyOn(Date, 'now').mockReturnValue(later);
            await nangoAction.proxy({ endpoint: '/issues' });
            expect(nango.getConnection).toHaveBeenCalledTimes(2);
        });
    });

    describe('Metadata', () => {
        it('getMetadata should reuse connection', async () => {
            await nangoAction.getConnection();
            await nangoAction.getMetadata();
            expect(nango.getConnection).toHaveBeenCalledTimes(1);
        });

        it('setMetadata should invalidate connection', async () => {
            await nangoAction.getConnection();
            await nangoAction.setMetadata({});
            await nangoAction.getConnection();
            await nangoAction.getMetadata();
            expect(nango.getConnection).toHaveBeenCalledTimes(2);
        });
    });

    describe('Integration', () => {
        it('getWebhookURL should reuse integration', async () => {
            await nangoAction.getWebhookURL();
            await nangoAction.getWebhookURL();
            expect(nango.getIntegration).toHaveBeenCalledTimes(1);
        });
    });
});

describe('Pagination', () => {
    const providerConfigKey = 'github';
    const connectionId = 'connection-1';

    const cursorPagination: CursorPagination = {
        type: 'cursor',
        cursor_path_in_response: 'metadata.next_cursor',
        cursor_name_in_request: 'cursor',
        limit_name_in_request: 'limit',
        response_path: 'issues'
    };
    const offsetPagination: OffsetPagination = {
        type: 'offset',
        limit_name_in_request: 'per_page',
        offset_name_in_request: 'offset',
        response_path: 'issues'
    };
    const linkPagination: LinkPagination = {
        type: 'link',
        response_path: 'issues',
        limit_name_in_request: 'limit',
        link_path_in_response_body: 'metadata.next_cursor'
    };

    const paginationConfigs = [cursorPagination, offsetPagination, linkPagination];

    let nangoAction: NangoActionRunner;

    beforeEach(async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.saveLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        const config: NangoProps = {
            ...nangoProps,
            secretKey: 'encrypted',
            providerConfigKey,
            connectionId
        };
        nangoAction = new NangoActionRunner(config, { persistClient, locks });

        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockReturnValue({ credentials: { type: 'OAUTH2', access_token: 'token' } });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Throws error if there is no pagination config in provider template', async () => {
        const provider: Provider = {
            display_name: 'test',
            auth_mode: 'OAUTH2',
            proxy: { base_url: '' },
            authorization_url: '',
            token_url: '',
            docs: ''
        };
        vi.spyOn(await import('@nangohq/providers'), 'getProvider').mockImplementation(() => provider);

        const expectedErrorMessage = 'There was no pagination configuration for this integration or configuration passed in';
        await expect(() => nangoAction.paginate({ endpoint: '' }).next()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Sends pagination params in body for POST HTTP method', async () => {
        await stubProviderTemplate(cursorPagination);

        const spy = vi.spyOn(ProxyRequest.prototype, 'httpCall').mockReturnValueOnce(Promise.resolve({ data: { issues: [] } } as AxiosResponse));

        const endpoint = '/issues';

        await nangoAction.paginate({ endpoint, method: 'POST', paginate: { limit: 2 }, connectionId: 'abc' }).next();

        expect(spy).toHaveBeenCalledWith({
            method: 'POST',
            url: 'https://api.github.com/issues',
            data: { limit: 2 },
            headers: {
                authorization: 'Bearer token',
                'user-agent': expect.any(String)
            }
        });
    });

    it('Overrides template pagination params with ones passed in the proxy config', async () => {
        await stubProviderTemplate(cursorPagination);

        const spy = vi
            .spyOn(ProxyRequest.prototype, 'httpCall')
            .mockReturnValueOnce(Promise.resolve({ data: { issues: [{}, {}, {}] } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: [] } } as AxiosResponse));

        const endpoint = '/issues';
        const paginationConfigOverride: OffsetPagination = {
            type: 'offset',
            limit_name_in_request: 'per_page',
            limit: 3,
            offset_name_in_request: 'offset',
            response_path: 'issues'
        };

        const generator = nangoAction.paginate({ endpoint, paginate: paginationConfigOverride });
        for await (const batch of generator) {
            expect(batch.length).toBe(3);
        }

        expect(spy).toHaveBeenLastCalledWith({
            method: 'GET',
            url: 'https://api.github.com/issues?per_page=3&offset=3',
            headers: {
                authorization: 'Bearer token',
                'user-agent': expect.any(String)
            }
        });
    });

    it('Paginates using offset', async () => {
        await stubProviderTemplate(offsetPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];

        vi.spyOn(ProxyRequest.prototype, 'httpCall')
            .mockReturnValueOnce(Promise.resolve({ data: { issues: firstBatch } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: secondBatch } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: [] } } as AxiosResponse));

        const endpoint = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        const actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        const expectedRecords = [...firstBatch, ...secondBatch];

        expect(actualRecords).toStrictEqual(expectedRecords);
    });

    it('Paginates using cursor', async () => {
        await stubProviderTemplate(cursorPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        const thirdBatch: any[] = [{ id: 7 }, { id: 8 }, { id: 9 }];

        vi.spyOn(ProxyRequest.prototype, 'httpCall')
            .mockReturnValueOnce(Promise.resolve({ data: { issues: firstBatch, metadata: { next_cursor: '2' } } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: secondBatch, metadata: { next_cursor: '2' } } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: thirdBatch } } as AxiosResponse));

        const endpoint = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        const actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        const expectedRecords = [...firstBatch, ...secondBatch, ...thirdBatch];

        expect(actualRecords).toStrictEqual(expectedRecords);
    });

    it('Stops pagination if cursor is empty', async () => {
        await stubProviderTemplate(cursorPagination);

        const onlyBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];

        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockReturnValueOnce(
            Promise.resolve({ data: { issues: onlyBatch, metadata: { next_cursor: '' } } } as AxiosResponse)
        );

        const endpoint = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        const actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        expect(actualRecords).toStrictEqual(onlyBatch);
    });

    it.each(paginationConfigs)(
        'Extracts records from nested body param for $type pagination type',
        async (paginationConfig: CursorPagination | OffsetPagination | LinkPagination) => {
            await stubProviderTemplate(paginationConfig);

            const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
            const emptyBatch: any[] = [];

            const spy = vi
                .spyOn(ProxyRequest.prototype, 'httpCall')
                .mockReturnValueOnce(Promise.resolve({ data: { issues: firstBatch, metadata: { next_cursor: '' } } } as AxiosResponse))
                .mockReturnValueOnce(Promise.resolve({ data: { issues: emptyBatch, metadata: { next_cursor: '' } } } as AxiosResponse));
            const endpoint = '/issues';

            const generator = nangoAction.paginate({ endpoint });

            const actualRecords: any[] = [];
            for await (const batch of generator) {
                actualRecords.push(...batch);
            }

            expect(actualRecords).toStrictEqual(firstBatch);
            spy.mockRestore(); // If this test fails, the mock is not restored and the next test will fail
        }
    );

    it.each([
        // TODO: validate proper config is passed to proxy
        ['https://api.github.com/issues?page=2', 'https://api.github.com/issues?page=3'],
        ['/issues?page=2', '/issues?page=3']
    ])('Paginates using next URL/path %s from body', async (nextUrlOrPathValue, anotherNextUrlOrPathValue) => {
        await stubProviderTemplate(linkPagination);

        const firstBatch: { id: number }[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: { id: number }[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        const thirdBatch: { id: number }[] = [{ id: 7 }, { id: 8 }, { id: 9 }];

        const spy = vi
            .spyOn(ProxyRequest.prototype, 'httpCall')
            .mockReturnValueOnce(Promise.resolve({ data: { issues: firstBatch, metadata: { next_cursor: nextUrlOrPathValue } } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: secondBatch, metadata: { next_cursor: anotherNextUrlOrPathValue } } } as AxiosResponse))
            .mockReturnValueOnce(Promise.resolve({ data: { issues: thirdBatch } } as AxiosResponse));

        const endpoint = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        const actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        expect(spy).toHaveBeenNthCalledWith(1, {
            method: 'GET',
            url: 'https://api.github.com/issues',
            headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
        });
        expect(spy).toHaveBeenNthCalledWith(2, {
            method: 'GET',
            url: 'https://api.github.com/issues?page=2',
            headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
        });
        expect(spy).toHaveBeenNthCalledWith(3, {
            method: 'GET',
            url: 'https://api.github.com/issues?page=3',
            headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
        });
        expect(spy).toHaveBeenCalledTimes(3);

        const expectedRecords = [...firstBatch, ...secondBatch, ...thirdBatch];
        expect(actualRecords).toStrictEqual(expectedRecords);
        spy.mockRestore(); // If this test fails, the mock is not restored and the next test will fail
    });

    const stubProviderTemplate = async (paginationConfig: Pagination) => {
        const provider: Provider = buildTemplate(paginationConfig);

        vi.spyOn(await import('@nangohq/providers'), 'getProvider').mockImplementation(() => provider);
    };

    const buildTemplate = (paginationConfig: Pagination): Provider => {
        return {
            display_name: 'test',
            auth_mode: 'OAUTH2',
            proxy: { base_url: 'https://api.github.com/', paginate: paginationConfig },
            authorization_url: '',
            token_url: '',
            docs: ''
        };
    };
});

describe('batchSave', () => {
    it('should validate records with json schema', async () => {
        const nango = new NangoSyncRunner(
            {
                ...nangoProps,
                runnerFlags: { validateSyncRecords: true } as any,
                syncConfig: {
                    models_json_schema: {
                        definitions: { Test: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }
                    }
                } as any
            },
            { locks }
        );

        await expect(async () => await nango.batchSave([{ foo: 'bar' }], 'Test')).rejects.toThrow(
            new InvalidRecordSDKError({
                data: {
                    foo: 'bar'
                },
                model: 'Test',
                validation: [
                    {
                        instancePath: '',
                        keyword: 'required',
                        message: "must have required property 'id'",
                        params: {
                            missingProperty: 'id'
                        },
                        schemaPath: '#/required'
                    },
                    {
                        instancePath: '',
                        keyword: 'additionalProperties',
                        message: 'must NOT have additional properties',
                        params: {
                            additionalProperty: 'foo'
                        },
                        schemaPath: '#/additionalProperties'
                    }
                ]
            })
        );
    });
});

describe('Log', () => {
    const persistClient = (() => {
        const client = new PersistClient({ secretKey: '***' });
        client.saveLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        return client;
    })();

    const nangoAction = new NangoActionRunner({ ...nangoProps }, { persistClient, locks });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should enforce activityLogId', () => {
        expect(() => {
            new NangoActionRunner({ ...nangoProps, activityLogId: undefined as unknown as string }, { locks });
        }).toThrowError(new Error('Parameter activityLogId is required'));
    });

    it('should not fail on null', async () => {
        await nangoAction.log(null);

        expect(persistClient.saveLog).toHaveBeenCalledWith({
            environmentId: 1,
            data: expect.stringMatching('{"activityLogId":"1","log":{"createdAt":".*","level":"info","message":"null","source":"user","type":"log"}}')
        });
    });

    it('should allow level', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps }, { persistClient, locks });

        await nangoAction.log('hello', { level: 'error' });

        expect(persistClient.saveLog).toHaveBeenCalledWith({
            environmentId: 1,
            data: expect.stringMatching('{"activityLogId":"1","log":{"createdAt":".*","level":"error","message":"hello","source":"user","type":"log"}}')
        });
    });

    it('should enforce type: log message + object + level', async () => {
        await nangoAction.log('hello', { foo: 'bar' }, { level: 'foobar' });
    });

    it('should enforce type: log message +level', async () => {
        await nangoAction.log('hello', { level: 'foobar' });
    });

    it('should enforce type: log message + object', async () => {
        await nangoAction.log('hello', { foo: 'bar' });
    });
});

describe('Aborted script', () => {
    it('show throw', async () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal }, { locks });
        ac.abort();
        await expect(nango.log('hello')).rejects.toThrowError(new AbortedSDKError());
    });
});

describe('getRecordsById', () => {
    it('show throw if aborted', async () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal }, { locks });
        ac.abort();
        await expect(nango.getRecordsByIds(['a', 'b', 'c'], 'hello')).rejects.toThrowError(new AbortedSDKError());
    });

    it('should return empty map if no ids', async () => {
        const mockPersistClient = new PersistClient({ secretKey: '***' });
        mockPersistClient.getRecords = vi.fn();

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        const result = await nango.getRecordsByIds([], 'Wello');
        expect(result).toEqual(new Map());
        expect(mockPersistClient.getRecords).not.toHaveBeenCalled();
    });

    it('should call getRecords once for less than the batch size', async () => {
        const records = new Map<number, { id: string }>();
        for (let i = 0; i < 10; i++) {
            records.set(i, { id: i.toString() });
        }

        const mockPersistClient = new PersistClient({ secretKey: '***' });
        mockPersistClient.getRecords = vi.fn().mockResolvedValueOnce(Ok({ records: Array.from(records.values()), nextCursor: undefined }));

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        const result = await nango.getRecordsByIds(Array.from(records.keys()), 'Whatever');

        expect(result).toEqual(records);
        expect(mockPersistClient.getRecords).toHaveBeenCalledOnce();
    });

    it("should call getRecords multiple times if there's more than the batch size", async () => {
        const records = new Map<number, { id: string }>();
        for (let i = 0; i < 200; i++) {
            records.set(i, { id: i.toString() });
        }

        const mockPersistClient = new PersistClient({ secretKey: '***' });
        const recordsArray = Array.from(records.values());
        mockPersistClient.getRecords = vi
            .fn()
            .mockResolvedValueOnce(Ok({ records: recordsArray.slice(0, 100), nextCursor: 'next' }))
            .mockResolvedValueOnce(Ok({ records: recordsArray.slice(100, 200), nextCursor: 'next' }));

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        const result = await nango.getRecordsByIds(Array.from(records.keys()), 'Whatever');

        expect(result).toEqual(records);
        expect(mockPersistClient.getRecords).toHaveBeenCalledTimes(2);
    });
});

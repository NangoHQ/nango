/* eslint-disable @typescript-eslint/unbound-method */
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Nango } from '@nangohq/node';
import { ExecutionAbortedSDKError } from '@nangohq/runner-sdk';
import { ProxyRequest } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { PersistClient } from '../clients/persist.js';
import { MapLocks } from './locks.js';
import { createFunctionFacade, NangoActionRunner, NangoSyncRunner } from './sdk.js';

import type { CursorPagination, DBSyncConfig, LinkPagination, NangoProps, OffsetPagination, Pagination, Provider } from '@nangohq/types';
import type { AxiosResponse } from 'axios';
import type { Mock } from 'vitest';

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
    heartbeatTimeoutSecs: 30,
    logger: { level: 'info' }
};

const locks = new MapLocks();

describe('cache', () => {
    let nangoAction: NangoActionRunner;
    let nango: Nango;

    beforeEach(async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
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
            await nangoAction.setMetadata({} as never);
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

describe('proxy base URL override denylist', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('blocks denylisted base URL overrides using startup policy', async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        Nango.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockImplementation(() => Promise.resolve({} as AxiosResponse));

        const nangoAction = new NangoActionRunner({ ...nangoProps, scriptType: 'action' }, { persistClient, locks: new MapLocks() });

        await expect(
            nangoAction.proxy({
                endpoint: '/',
                baseUrlOverride: 'http://localhost:4566/'
            })
        ).rejects.toMatchObject({ code: 'base_url_override_not_allowed' });

        expect(ProxyRequest.prototype.httpCall).not.toHaveBeenCalled();
    });

    it('does not allow bypassing denylist via runtime env mutation', async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        Nango.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockImplementation(() => Promise.resolve({} as AxiosResponse));

        const nangoAction = new NangoActionRunner({ ...nangoProps, scriptType: 'action' }, { persistClient, locks: new MapLocks() });

        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', 'null');
        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED', 'true');

        await expect(
            nangoAction.proxy({
                endpoint: '/',
                baseUrlOverride: 'http://localhost:4566/'
            })
        ).rejects.toMatchObject({ code: 'base_url_override_not_allowed' });

        expect(ProxyRequest.prototype.httpCall).not.toHaveBeenCalled();
    });

    it('blocks AWS SigV4 per-connection base_url via resolved proxy URL validation', async () => {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
        Nango.prototype.getConnection = vi.fn().mockReturnValue({
            credentials: {
                type: 'AWS_SIGV4',
                raw: {},
                role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                region: 'us-east-1',
                service: 'dynamodb',
                access_key_id: 'AKIDEXAMPLE',
                secret_access_key: 'secret',
                session_token: 'token'
            },
            connection_config: { base_url: 'http://localhost:4566' }
        });
        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockImplementation(() => Promise.resolve({} as AxiosResponse));

        const nangoAction = new NangoActionRunner(
            { ...nangoProps, scriptType: 'action', provider: 'aws-sigv4', providerConfigKey: 'aws-sigv4' },
            { persistClient, locks: new MapLocks() }
        );

        await expect(
            nangoAction.proxy({
                endpoint: '/tables'
            })
        ).rejects.toMatchObject({ code: 'base_url_override_not_allowed' });

        expect(ProxyRequest.prototype.httpCall).not.toHaveBeenCalled();
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
        persistClient.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
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

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'https://api.github.com/issues',
                data: { limit: 2 },
                headers: {
                    authorization: 'Bearer token',
                    'user-agent': expect.any(String)
                }
            })
        );
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

        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.github.com/issues?per_page=3&offset=3',
                headers: {
                    authorization: 'Bearer token',
                    'user-agent': expect.any(String)
                }
            })
        );
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

        expect(spy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.github.com/issues',
                headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
            })
        );
        expect(spy).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.github.com/issues?page=2',
                headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
            })
        );
        expect(spy).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.github.com/issues?page=3',
                headers: { authorization: 'Bearer token', 'user-agent': expect.any(String) }
            })
        );
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

describe('Log', () => {
    const persistClient = (() => {
        const client = new PersistClient({ secretKey: '***' });
        client.postLog = vi.fn().mockReturnValue(Promise.resolve(Ok(undefined)));
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

        expect(persistClient.postLog).toHaveBeenCalledWith({
            environmentId: 1,
            data: expect.stringMatching('{"activityLogId":"1","log":{"createdAt":".*","level":"info","message":"null","source":"user","type":"log"}}')
        });
    });

    it('should allow level', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps }, { persistClient, locks });

        await nangoAction.log('hello', { level: 'error' });

        expect(persistClient.postLog).toHaveBeenCalledWith({
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

    it('should respect logger level', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps, logger: { level: 'warn' } }, { persistClient, locks });
        await nangoAction.log('hello', { level: 'info' });
        expect(persistClient.postLog).not.toHaveBeenCalled();
    });
    it('should allow setting logger level', () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps, logger: { level: 'debug' } }, { persistClient, locks });
        nangoAction.setLogger({ level: 'info' });
        expect(nangoAction['logger'].level).toBe('info');
    });
    it('should prevent setting logger level if off', () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps, logger: { level: 'off' } }, { persistClient, locks });
        nangoAction.setLogger({ level: 'info' });
        expect(nangoAction['logger'].level).toBe('off');
    });
});

describe('Aborted script', () => {
    it('show throw', async () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal }, { locks });
        ac.abort();
        await expect(nango.log('hello')).rejects.toThrowError(new ExecutionAbortedSDKError());
    });
});

describe('getRecordsById', () => {
    it('show throw if aborted', async () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal }, { locks });
        ac.abort();
        await expect(nango.getRecordsByIds(['a', 'b', 'c'], 'hello')).rejects.toThrowError(new ExecutionAbortedSDKError());
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

describe('listRecords', () => {
    it('should throw if aborted while iterating', async () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal }, { locks });
        ac.abort();
        await expect(
            (async () => {
                for await (const _ of nango.listRecords('SomeModel')) {
                    // empty
                }
            })()
        ).rejects.toThrowError(new ExecutionAbortedSDKError());
    });

    it('should yield all records from a single page', async () => {
        const records = [
            { id: '1', name: 'a' },
            { id: '2', name: 'b' }
        ];
        const mockPersistClient = new PersistClient({ secretKey: '***' });
        mockPersistClient.getRecords = vi.fn().mockResolvedValueOnce(Ok({ records, nextCursor: null }));

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        const out: unknown[] = [];
        for await (const row of nango.listRecords('SomeModel')) {
            out.push(row);
        }

        expect(out).toEqual(records);
        expect(mockPersistClient.getRecords).toHaveBeenCalledOnce();
        expect(mockPersistClient.getRecords).toHaveBeenCalledWith({
            model: 'SomeModel',
            environmentId: nangoProps.environmentId,
            nangoConnectionId: nangoProps.nangoConnectionId,
            cursor: undefined,
            externalIds: undefined,
            limit: undefined
        });
    });

    it('should pass cursor to getRecords when options.cursor is set', async () => {
        const mockPersistClient = new PersistClient({ secretKey: '***' });
        mockPersistClient.getRecords = vi.fn().mockResolvedValueOnce(Ok({ records: [], nextCursor: null }));

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        for await (const _ of nango.listRecords('SomeModel', { cursor: 'cursor123' })) {
            // empty
        }

        expect(mockPersistClient.getRecords).toHaveBeenCalledWith({
            model: 'SomeModel',
            environmentId: nangoProps.environmentId,
            nangoConnectionId: nangoProps.nangoConnectionId,
            cursor: 'cursor123',
            externalIds: undefined,
            limit: undefined
        });
    });

    it('should follow next_cursor and yield records across pages', async () => {
        const page1 = [{ id: '1' }];
        const page2 = [{ id: '2' }, { id: '3' }];
        const mockPersistClient = new PersistClient({ secretKey: '***' });
        mockPersistClient.getRecords = vi
            .fn()
            .mockResolvedValueOnce(Ok({ records: page1, nextCursor: 'c2' }))
            .mockResolvedValueOnce(Ok({ records: page2, nextCursor: null }));

        const nango = new NangoSyncRunner({ ...nangoProps }, { persistClient: mockPersistClient, locks });
        const out: unknown[] = [];
        for await (const row of nango.listRecords('SomeModel')) {
            out.push(row);
        }

        expect(out).toEqual([...page1, ...page2]);
        expect(mockPersistClient.getRecords).toHaveBeenCalledTimes(2);
        expect(mockPersistClient.getRecords).toHaveBeenNthCalledWith(1, {
            model: 'SomeModel',
            environmentId: nangoProps.environmentId,
            nangoConnectionId: nangoProps.nangoConnectionId,
            cursor: undefined,
            externalIds: undefined,
            limit: undefined
        });
        expect(mockPersistClient.getRecords).toHaveBeenNthCalledWith(2, {
            model: 'SomeModel',
            environmentId: nangoProps.environmentId,
            nangoConnectionId: nangoProps.nangoConnectionId,
            cursor: 'c2',
            externalIds: undefined,
            limit: undefined
        });
    });
});

describe('proxy 401 invalid credentials', () => {
    const stableCredentials = {
        type: 'OAUTH2' as const,
        access_token: 'same-token',
        expires_at: '2099-01-01T00:00:00.000Z',
        refresh_token: 'refresh'
    };

    const proxyProvider401TestKey = 'proxy-provider-401-test';

    function baseProxyProvider(retry?: { error_code: string[] }): Provider {
        return {
            display_name: 'test',
            auth_mode: 'OAUTH2',
            authorization_url: 'https://example.com/oauth',
            token_url: 'https://example.com/token',
            docs: '',
            proxy: {
                base_url: 'https://api.example.com',
                ...(retry ? { retry } : {})
            }
        };
    }

    function create401AxiosError(): AxiosError {
        return new AxiosError(
            'Request failed with status code 401',
            'ERR_BAD_REQUEST',
            {} as never,
            {},
            {
                status: 401,
                statusText: 'Unauthorized',
                data: {},
                headers: {},
                config: {} as never
            }
        );
    }

    function expectInvalidCredentialsInLogs(persistClient: PersistClient, present: boolean): void {
        const found = vi.mocked(persistClient.postLog).mock.calls.some((call: [{ environmentId: number; data: string }]) => {
            const data = call[0]?.data;
            return typeof data === 'string' && data.includes('invalid_credentials');
        });
        expect(found).toBe(present);
    }

    let persistClient: PersistClient;
    let getConnectionMock: Mock<Nango['getConnection']>;

    beforeEach(async () => {
        persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockResolvedValue(Ok(undefined));

        const nodeClient = (await import('@nangohq/node')).Nango;
        getConnectionMock = vi.fn<Nango['getConnection']>().mockResolvedValue({
            credentials: stableCredentials
        } as unknown as Awaited<ReturnType<Nango['getConnection']>>);
        nodeClient.prototype.getConnection = getConnectionMock;
        nodeClient.prototype.setMetadata = vi.fn().mockResolvedValue({});
        nodeClient.prototype.getIntegration = vi.fn().mockResolvedValue({ data: { provider: proxyProvider401TestKey } });

        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockRejectedValue(create401AxiosError());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('stops retry when retry reason is provider_error_code_401 and credentials are unchanged', async () => {
        const providers = await import('@nangohq/providers');
        vi.spyOn(providers, 'getProvider').mockReturnValue(baseProxyProvider({ error_code: ['401'] }));

        const nango = new NangoActionRunner({ ...nangoProps, provider: proxyProvider401TestKey }, { persistClient, locks });

        await expect(nango.proxy({ endpoint: '/x', retries: 10 })).rejects.toThrow();

        expect(ProxyRequest.prototype.httpCall).toHaveBeenCalledTimes(2);
        expect(getConnectionMock).toHaveBeenCalledTimes(2);
        expectInvalidCredentialsInLogs(persistClient, true);
    });

    it('stops retry when retry reason is status_code_401 and credentials are unchanged', async () => {
        const providers = await import('@nangohq/providers');
        vi.spyOn(providers, 'getProvider').mockReturnValue(baseProxyProvider());

        const nango = new NangoActionRunner({ ...nangoProps, provider: proxyProvider401TestKey }, { persistClient, locks });

        await expect(nango.proxy({ endpoint: '/x', retries: 10 })).rejects.toThrow();

        expect(ProxyRequest.prototype.httpCall).toHaveBeenCalledTimes(2);
        expect(getConnectionMock).toHaveBeenCalledTimes(2);
        expectInvalidCredentialsInLogs(persistClient, true);
    });

    it('succeeds after credential refresh without invalid_credentials when the next request no longer returns 401', async () => {
        const providers = await import('@nangohq/providers');
        vi.spyOn(providers, 'getProvider').mockReturnValue(baseProxyProvider({ error_code: ['401'] }));

        getConnectionMock.mockReset();
        getConnectionMock
            .mockResolvedValueOnce({
                credentials: { ...stableCredentials, access_token: 'before-refresh' }
            } as unknown as Awaited<ReturnType<Nango['getConnection']>>)
            .mockResolvedValueOnce({
                credentials: { ...stableCredentials, access_token: 'after-refresh' }
            } as unknown as Awaited<ReturnType<Nango['getConnection']>>);

        const httpSpy = vi.spyOn(ProxyRequest.prototype, 'httpCall');
        httpSpy.mockReset();
        httpSpy.mockRejectedValueOnce(create401AxiosError()).mockResolvedValueOnce({
            status: 200,
            statusText: 'OK',
            data: {},
            headers: {},
            config: {} as never
        } as AxiosResponse);

        const nango = new NangoActionRunner({ ...nangoProps, provider: proxyProvider401TestKey }, { persistClient, locks });

        const res = await nango.proxy({ endpoint: '/x', retries: 10 });

        expect(res.status).toBe(200);
        expect(httpSpy).toHaveBeenCalledTimes(2);
        expect(getConnectionMock).toHaveBeenCalledTimes(2);
        expectInvalidCredentialsInLogs(persistClient, false);
    });
});

describe('createFunctionFacade', () => {
    const blockedProperties = ['nango', 'persistClient', 'telemetryRecorder', 'locking', 'checkpointing', 'checkpointKey'] as const;

    beforeEach(async () => {
        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockResolvedValue({ credentials: {} });
        nodeClient.prototype.setMetadata = vi.fn().mockResolvedValue({});
        nodeClient.prototype.getIntegration = vi.fn().mockResolvedValue({ data: { provider: 'github' } });
        vi.spyOn(ProxyRequest.prototype, 'httpCall').mockResolvedValue({
            status: 200,
            statusText: 'OK',
            data: {},
            headers: {},
            config: {} as never
        } as AxiosResponse);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    function buildActionFacade() {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockResolvedValue(Ok(undefined));
        const runner = new NangoActionRunner({ ...nangoProps, scriptType: 'action' }, { persistClient, locks });
        return { facade: createFunctionFacade(runner), persistClient };
    }

    function buildSyncFacade() {
        const persistClient = new PersistClient({ secretKey: '***' });
        persistClient.postLog = vi.fn().mockResolvedValue(Ok(undefined));
        persistClient.postRecords = vi.fn().mockResolvedValue({ result: Ok({ nextMerging: { strategy: 'override' } }), bytesSent: 0 });
        const runner = new NangoSyncRunner({ ...nangoProps }, { persistClient, locks });
        return { facade: createFunctionFacade(runner), persistClient };
    }

    describe('blocks access to internal properties', () => {
        for (const prop of blockedProperties) {
            it(`throws when reading "${prop}"`, () => {
                const { facade } = buildActionFacade();
                expect(() => (facade as any)[prop]).toThrowError(/is not allowed/);
            });
        }

        it('blocks reaching the raw Axios instance via nango.http', () => {
            const { facade } = buildActionFacade();
            // Accessing `.nango` throws before `.http` can be reached
            expect(() => (facade as any).nango.http).toThrowError(/is not allowed/);
        });

        it('cannot recover the node client via getOwnPropertyDescriptor', () => {
            const { facade } = buildActionFacade();
            expect(Object.getOwnPropertyDescriptor(facade, 'nango')).toBeUndefined();
        });

        it('hides blocked properties from "in", Object.keys and ownKeys', () => {
            const { facade } = buildActionFacade();
            for (const prop of blockedProperties) {
                expect(prop in facade).toBe(false);
            }
            expect(Object.keys(facade)).not.toContain('nango');
            expect(Reflect.ownKeys(facade)).not.toContain('nango');
        });

        it('throws when writing to a blocked property', () => {
            const { facade } = buildActionFacade();
            expect(() => {
                (facade as any).nango = {};
            }).toThrowError(/is not allowed/);
        });

        it('blocks access on the sync runner facade too', () => {
            const { facade } = buildSyncFacade();
            expect(() => (facade as any).nango).toThrowError(/is not allowed/);
        });
    });

    describe('protects execution-control fields (abort/kill)', () => {
        it('throws when reading abortSignal or lifecycle', () => {
            const { facade } = buildActionFacade();
            expect(() => (facade as any).abortSignal).toThrowError(/is not allowed/);
            expect(() => (facade as any).lifecycle).toThrowError(/is not allowed/);
        });

        it('throws when overwriting abortSignal or lifecycle', () => {
            const { facade } = buildActionFacade();
            expect(() => {
                (facade as any).abortSignal = { aborted: false };
            }).toThrowError(/is not allowed/);
            expect(() => {
                (facade as any).lifecycle = undefined;
            }).toThrowError(/is not allowed/);
        });

        it('cannot disable abort enforcement by overwriting abortSignal through the facade', async () => {
            const ac = new AbortController();
            const persistClient = new PersistClient({ secretKey: '***' });
            persistClient.postLog = vi.fn().mockResolvedValue(Ok(undefined));
            const runner = new NangoActionRunner({ ...nangoProps, scriptType: 'action', abortSignal: ac.signal }, { persistClient, locks });
            const facade = createFunctionFacade(runner);
            ac.abort();

            // Attempt to neutralize the abort signal via the facade — must be rejected
            expect(() => {
                (facade as any).abortSignal = { aborted: false };
            }).toThrowError(/is not allowed/);

            // The real signal is untouched, so SDK calls still honor the abort
            expect(runner.abortSignal?.aborted).toBe(true);
            await expect(facade.log('hello')).rejects.toThrowError(new ExecutionAbortedSDKError());
        });
    });

    describe('blocks prototype-chain escape hatches', () => {
        it('hides the real runner prototype via getPrototypeOf', () => {
            const { facade } = buildActionFacade();
            expect(Object.getPrototypeOf(facade)).toBeNull();
            expect(Reflect.getPrototypeOf(facade)).toBeNull();
        });

        it('throws when reading __proto__ or constructor', () => {
            const { facade } = buildActionFacade();
            expect(() => (facade as any).__proto__).toThrowError(/is not allowed/);
            expect(() => (facade as any).constructor).toThrowError(/is not allowed/);
        });

        it('throws when re-parenting the runner', () => {
            const { facade } = buildActionFacade();
            expect(() => {
                (facade as any).__proto__ = {};
            }).toThrowError(/is not allowed/);
            expect(() => Object.setPrototypeOf(facade, {})).toThrowError(/is not allowed/);
        });

        it('cannot pollute the shared class prototype through the facade', () => {
            const { facade } = buildActionFacade();
            const original = NangoActionRunner.prototype.proxy;

            // getPrototypeOf returns null, so there is no reachable prototype object to mutate
            expect(Object.getPrototypeOf(facade)).toBeNull();

            // and the real shared prototype is left untouched
            expect(NangoActionRunner.prototype.proxy).toBe(original);
        });

        it('hides prototype escape hatches on the sync runner facade too', () => {
            const { facade } = buildSyncFacade();
            expect(Object.getPrototypeOf(facade)).toBeNull();
            expect(() => (facade as any).constructor).toThrowError(/is not allowed/);
        });
    });

    describe('still exposes the public SDK surface', () => {
        it('reads non-blocked properties', () => {
            const { facade } = buildActionFacade();
            expect(facade.connectionId).toBe(nangoProps.connectionId);
            expect(facade.providerConfigKey).toBe(nangoProps.providerConfigKey);
        });

        it('runs proxy() through the facade', async () => {
            const { facade } = buildActionFacade();
            const res = await facade.proxy({ endpoint: '/issues' });
            expect(res.status).toBe(200);
        });

        it('runs getConnection() through the facade', async () => {
            const { facade } = buildActionFacade();
            await expect(facade.getConnection()).resolves.toBeDefined();
        });

        it('runs log() through the facade', async () => {
            const { facade, persistClient } = buildActionFacade();
            await facade.log('hello');
            expect(persistClient.postLog).toHaveBeenCalledOnce();
        });

        it('runs borrowed methods (proxy, log, batchSave) on the sync runner facade', async () => {
            const { facade, persistClient } = buildSyncFacade();
            const res = await facade.proxy({ endpoint: '/issues' });
            expect(res.status).toBe(200);

            // proxy() can emit its own HTTP log, so reset before asserting log() specifically
            vi.mocked(persistClient.postLog).mockClear();
            await facade.log('hello');
            expect(persistClient.postLog).toHaveBeenCalledOnce();

            await expect(facade.batchSave([{ id: '1' }], 'SomeModel')).resolves.toBe(true);
            expect(persistClient.postRecords).toHaveBeenCalledOnce();
        });
    });
});

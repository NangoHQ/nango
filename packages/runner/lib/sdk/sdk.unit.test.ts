/* eslint-disable @typescript-eslint/unbound-method */
import { Nango } from '@nangohq/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidHttpUrl, proxyService } from '@nangohq/shared';
import type { CursorPagination, DBSyncConfig, LinkPagination, NangoProps, OffsetPagination, Pagination, Provider } from '@nangohq/types';
import type { AxiosResponse } from 'axios';
import { NangoActionRunner, NangoSyncRunner } from './sdk.js';
import { AbortedSDKError, InvalidRecordSDKError } from '@nangohq/runner-sdk';

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
    endUser: null
};

describe('cache', () => {
    let nangoAction: NangoActionRunner;
    let nango: Nango;
    beforeEach(async () => {
        nangoAction = new NangoActionRunner({
            ...nangoProps
        });
        nango = new Nango({ secretKey: '***' });
        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
        nodeClient.prototype.setMetadata = vi.fn().mockReturnValue({});
        nodeClient.prototype.getIntegration = vi.fn().mockReturnValue({ data: { provider: 'github' } });
        vi.spyOn(proxyService, 'route').mockImplementation(() => Promise.resolve({ response: {} as AxiosResponse, logs: [] }));
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
        const config: NangoProps = {
            ...nangoProps,
            secretKey: 'encrypted',
            providerConfigKey,
            connectionId
        };
        nangoAction = new NangoActionRunner(config);

        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
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

        const spy = vi.spyOn(proxyService, 'route').mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: [] } } as AxiosResponse }));

        const endpoint = '/issues';

        await nangoAction.paginate({ endpoint, method: 'POST', paginate: { limit: 2 }, connectionId: 'abc' }).next();

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                endpoint,
                headers: {
                    'user-agent': expect.any(String)
                },
                data: { limit: 2 },
                paginate: { limit: 2 },
                connectionId: 'abc',
                providerConfigKey: 'github'
            }),
            expect.objectContaining({})
        );
    });

    it('Overrides template pagination params with ones passed in the proxy config', async () => {
        await stubProviderTemplate(cursorPagination);

        const spy = vi
            .spyOn(proxyService, 'route')
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: [{}, {}, {}] } } as AxiosResponse }))
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: [] } } as AxiosResponse }));

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
            {
                method: 'GET',
                endpoint,
                headers: {
                    'user-agent': expect.any(String)
                },
                params: { offset: '3', per_page: 3 },
                paginate: paginationConfigOverride,
                providerConfigKey,
                connectionId
            },
            { connection: { credentials: {} }, existingActivityLogId: '1', providerName: 'github' }
        );
    });

    it('Paginates using offset', async () => {
        await stubProviderTemplate(offsetPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];

        vi.spyOn(proxyService, 'route')
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: firstBatch } } as AxiosResponse }))
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: secondBatch } } as AxiosResponse }))
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: [] } } as AxiosResponse }));

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

        vi.spyOn(proxyService, 'route')
            .mockReturnValueOnce(
                Promise.resolve({
                    logs: [],
                    response: { data: { issues: firstBatch, metadata: { next_cursor: '2' } } } as AxiosResponse
                })
            )
            .mockReturnValueOnce(
                Promise.resolve({
                    logs: [],
                    response: { data: { issues: secondBatch, metadata: { next_cursor: '2' } } } as AxiosResponse
                })
            )
            .mockReturnValueOnce(Promise.resolve({ logs: [], response: { data: { issues: thirdBatch } } as AxiosResponse }));

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

        vi.spyOn(proxyService, 'route').mockReturnValueOnce(
            Promise.resolve({
                logs: [],
                response: { data: { issues: onlyBatch, metadata: { next_cursor: '' } } } as AxiosResponse
            })
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

            vi.spyOn(proxyService, 'route')
                .mockReturnValueOnce(
                    Promise.resolve({
                        logs: [],
                        response: { data: { issues: firstBatch, metadata: { next_cursor: '' } } } as AxiosResponse
                    })
                )
                .mockReturnValueOnce(
                    Promise.resolve({
                        logs: [],
                        response: { data: { issues: emptyBatch, metadata: { next_cursor: '' } } } as AxiosResponse
                    })
                );

            const endpoint = '/issues';

            const generator = nangoAction.paginate({ endpoint });

            const actualRecords: any[] = [];
            for await (const batch of generator) {
                actualRecords.push(...batch);
            }

            expect(actualRecords).toStrictEqual(firstBatch);
        }
    );

    it.each([
        // TODO: validate proper config is passed to proxy
        ['https://api.gihub.com/issues?page=2', 'https://api.gihub.com/issues?page=3'],
        ['/issues?page=2', '/issues?page=3']
    ])('Paginates using next URL/path %s from body', async (nextUrlOrPathValue, anotherNextUrlOrPathValue) => {
        await stubProviderTemplate(linkPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        const thirdBatch: any[] = [{ id: 7 }, { id: 8 }, { id: 9 }];

        const spy = vi
            .spyOn(proxyService, 'route')
            .mockReturnValueOnce(
                Promise.resolve({
                    logs: [],
                    response: { data: { issues: firstBatch, metadata: { next_cursor: nextUrlOrPathValue } } } as AxiosResponse
                })
            )
            .mockReturnValueOnce(
                Promise.resolve({
                    logs: [],
                    response: { data: { issues: secondBatch, metadata: { next_cursor: anotherNextUrlOrPathValue } } } as AxiosResponse
                })
            )
            .mockReturnValueOnce(
                Promise.resolve({
                    logs: [],
                    response: { data: { issues: thirdBatch } } as AxiosResponse
                })
            );

        const endpoint = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        const actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        const expectedRecords = [...firstBatch, ...secondBatch, ...thirdBatch];
        let expectedEndpoint: string;
        if (isValidHttpUrl(anotherNextUrlOrPathValue)) {
            const url: URL = new URL(anotherNextUrlOrPathValue);
            expectedEndpoint = url.pathname + url.search;
        } else {
            expectedEndpoint = anotherNextUrlOrPathValue;
        }

        expect(actualRecords).toStrictEqual(expectedRecords);
        expect(spy).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                endpoint: expectedEndpoint
            }),
            expect.objectContaining({
                providerName: 'github'
            })
        );
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
        const nango = new NangoSyncRunner({
            ...nangoProps,
            runnerFlags: { validateSyncRecords: true } as any,
            syncConfig: {
                models_json_schema: {
                    definitions: { Test: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }
                }
            } as any
        });

        await expect(async () => await nango.batchSave([{ foo: 'bar' }], 'Test')).rejects.toThrow(new InvalidRecordSDKError());
    });
});

describe('Log', () => {
    it('should enforce activityLogId when not in dryRun', () => {
        expect(() => {
            new NangoActionRunner({ ...nangoProps, activityLogId: undefined });
        }).toThrowError(new Error('Parameter activityLogId is required when not in dryRun'));
    });

    it('should not fail on null', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps });
        await nangoAction.log(null);
    });

    it('should allow level', async () => {
        const mock = vi.fn(() => ({ response: { status: 200 } }));
        const nangoAction = new NangoActionRunner({ ...nangoProps }, { persistApi: mock as any });

        await nangoAction.log('hello', { level: 'error' });

        expect(mock).toHaveBeenCalledWith({
            data: expect.any(String),
            headers: {
                Authorization: 'Bearer ***',
                'Content-Type': 'application/json'
            },
            method: 'POST',
            url: '/environment/1/log'
        });
        expect(JSON.parse((mock.mock.calls as any)[0][0].data)).toStrictEqual({
            activityLogId: '1',
            log: {
                type: 'log',
                level: 'error',
                message: 'hello',
                createdAt: expect.any(String),
                environmentId: 1,
                meta: null,
                source: 'user'
            }
        });
    });

    it('should enforce type: log message + object + level', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps });
        await nangoAction.log('hello', { foo: 'bar' }, { level: 'foobar' });
    });

    it('should enforce type: log message +level', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps });
        await nangoAction.log('hello', { level: 'foobar' });
    });

    it('should enforce type: log message + object', async () => {
        const nangoAction = new NangoActionRunner({ ...nangoProps });
        await nangoAction.log('hello', { foo: 'bar' });
    });
});

describe('Aborted script', () => {
    it('show throw', () => {
        const ac = new AbortController();
        const nango = new NangoSyncRunner({ ...nangoProps, abortSignal: ac.signal });
        ac.abort();
        expect(nango.log('hello')).rejects.toThrowError(new AbortedSDKError());
    });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { Nango } from '@nangohq/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockErrorManagerReport } from '../utils/error.manager.mocks.js';
import type { Config, SyncConfig } from '../models/index.js';
import type { Template } from '@nangohq/types';
import configService from '../services/config.service.js';
import type { CursorPagination, LinkPagination, OffsetPagination } from '../models/Proxy.js';
import type { NangoProps } from './sync.js';
import { NangoAction, NangoSync } from './sync.js';
import { isValidHttpUrl } from '../utils/utils.js';
import proxyService from '../services/proxy.service.js';
import type { AxiosResponse } from 'axios';

const nangoProps: NangoProps = {
    secretKey: '***',
    providerConfigKey: 'github',
    connectionId: 'connection-1',
    dryRun: false,
    activityLogId: '1',
    accountId: 1,
    environmentId: 1,
    lastSyncDate: new Date(),
    syncConfig: {} as SyncConfig,
    syncId: '1',
    syncJobId: 1,
    nangoConnectionId: 1
};

describe('cache', () => {
    let nangoAction: NangoAction;
    let nango: Nango;
    beforeEach(async () => {
        nangoAction = new NangoAction({
            ...nangoProps
        });
        nango = new Nango({ secretKey: '***' });
        const nodeClient = (await import('@nangohq/node')).Nango;
        nodeClient.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });
        nodeClient.prototype.setMetadata = vi.fn().mockReturnValue({});
        nodeClient.prototype.getIntegration = vi.fn().mockReturnValue({ config: { provider: 'github' } });
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

    let nangoAction: NangoAction;
    let nango: Nango;

    beforeEach(() => {
        const config: any = {
            secretKey: 'encrypted',
            serverUrl: 'https://example.com',
            providerConfigKey,
            connectionId,
            dryRun: true
        };
        nangoAction = new NangoAction(config);
        nango = new Nango({ secretKey: config.secretKey });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Throws error if there is no pagination config in provider template', async () => {
        const template: Template = {
            auth_mode: 'OAUTH2',
            proxy: { base_url: '' },
            authorization_url: '',
            token_url: ''
        };
        (await import('@nangohq/node')).Nango.prototype.getIntegration = vi.fn().mockReturnValue({ config: { provider: 'github' } });
        vi.spyOn(configService, 'getTemplate').mockImplementation(() => template);

        const expectedErrorMessage = 'There was no pagination configuration for this integration or configuration passed in';
        await expect(() => nangoAction.paginate({ endpoint: '' }).next()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Sends pagination params in body for POST HTTP method', async () => {
        stubProviderTemplate(cursorPagination);
        mockErrorManagerReport();

        vi.spyOn(configService, 'getProviderConfig').mockImplementation(() => {
            return Promise.resolve({} as Config);
        });

        // TODO: mock to return at least one more page to check that cursor is passed in body too
        (await import('@nangohq/node')).Nango.prototype.proxy = vi.fn().mockReturnValue({ data: { issues: [] } });
        (await import('@nangohq/node')).Nango.prototype.getIntegration = vi.fn().mockReturnValue({ config: { provider: 'github' } });
        (await import('@nangohq/node')).Nango.prototype.getConnection = vi.fn().mockReturnValue({ credentials: {} });

        const endpoint = '/issues';

        await nangoAction.paginate({ endpoint, method: 'POST', paginate: { limit: 2 }, connectionId: 'abc' }).next();

        expect(nango.proxy).toHaveBeenCalledWith({
            method: 'POST',
            endpoint,
            headers: {
                'user-agent': expect.any(String)
            },
            data: { limit: 2 },
            paginate: { limit: 2 },
            connectionId: 'abc',
            providerConfigKey: 'github'
        });
    });

    it('Overrides template pagination params with ones passed in the proxy config', async () => {
        stubProviderTemplate(cursorPagination);

        (await import('@nangohq/node')).Nango.prototype.proxy = vi
            .fn()
            .mockReturnValueOnce({ data: { issues: [{}, {}, {}] } })
            .mockReturnValueOnce({ data: { issues: [] } });

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

        expect(nango.proxy).toHaveBeenLastCalledWith({
            method: 'GET',
            endpoint,
            headers: {
                'user-agent': expect.any(String)
            },
            params: { offset: '3', per_page: 3 },
            paginate: paginationConfigOverride,
            providerConfigKey,
            connectionId
        });
    });

    it('Paginates using offset', async () => {
        stubProviderTemplate(offsetPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        (await import('@nangohq/node')).Nango.prototype.proxy = vi
            .fn()
            .mockReturnValueOnce({ data: { issues: firstBatch } })
            .mockReturnValueOnce({ data: { issues: secondBatch } })
            .mockReturnValueOnce({ data: { issues: [] } });

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
        stubProviderTemplate(cursorPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        const thirdBatch: any[] = [{ id: 7 }, { id: 8 }, { id: 9 }];
        (await import('@nangohq/node')).Nango.prototype.proxy = vi
            .fn()
            .mockReturnValueOnce({
                data: {
                    issues: firstBatch,
                    metadata: {
                        next_cursor: '2'
                    }
                }
            })
            .mockReturnValueOnce({
                data: {
                    issues: secondBatch,
                    metadata: {
                        next_cursor: '2'
                    }
                }
            })
            .mockReturnValueOnce({ data: { issues: thirdBatch } });

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
        stubProviderTemplate(cursorPagination);

        const onlyBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        (await import('@nangohq/node')).Nango.prototype.proxy = vi.fn().mockReturnValueOnce({
            data: {
                issues: onlyBatch,
                metadata: {
                    next_cursor: ''
                }
            }
        });

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
            stubProviderTemplate(paginationConfig);

            const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
            const emptyBatch: any[] = [];
            (await import('@nangohq/node')).Nango.prototype.proxy = vi
                .fn()
                .mockReturnValueOnce({
                    data: {
                        issues: firstBatch,
                        metadata: {
                            next_cursor: ''
                        }
                    }
                })

                .mockReturnValueOnce({
                    data: {
                        issues: emptyBatch,
                        metadata: {
                            next_cursor: ''
                        }
                    }
                });

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
        stubProviderTemplate(linkPagination);

        const firstBatch: any[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const secondBatch: any[] = [{ id: 4 }, { id: 5 }, { id: 6 }];
        const thirdBatch: any[] = [{ id: 7 }, { id: 8 }, { id: 9 }];
        (await import('@nangohq/node')).Nango.prototype.proxy = vi
            .fn()
            .mockReturnValueOnce({
                data: {
                    issues: firstBatch,
                    metadata: {
                        next_cursor: nextUrlOrPathValue
                    }
                }
            })
            .mockReturnValueOnce({
                data: {
                    issues: secondBatch,
                    metadata: {
                        next_cursor: anotherNextUrlOrPathValue
                    }
                }
            })
            .mockReturnValueOnce({ data: { issues: thirdBatch } });

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
        expect(nango.proxy).toHaveBeenCalledWith(
            expect.objectContaining({
                endpoint: expectedEndpoint
            })
        );
    });

    const stubProviderTemplate = (paginationConfig: CursorPagination | OffsetPagination | LinkPagination) => {
        const template: Template = buildTemplate(paginationConfig);
        vi.spyOn(configService, 'getTemplate').mockImplementation(() => template);
    };

    const buildTemplate = (paginationConfig: CursorPagination | OffsetPagination | LinkPagination): Template => {
        return {
            auth_mode: 'OAUTH2',
            proxy: { base_url: 'https://api.github.com/', paginate: paginationConfig },
            authorization_url: '',
            token_url: ''
        };
    };
});

describe('batchSave', () => {
    it('should validate records with json schema', async () => {
        const nango = new NangoSync({
            ...nangoProps,
            dryRun: true,
            runnerFlags: { validateSyncRecords: true } as any,
            syncConfig: {
                models_json_schema: {
                    definitions: { Test: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }
                }
            } as any
        });

        await expect(async () => await nango.batchSave([{ foo: 'bar' }], 'Test')).rejects.toThrow(new Error(`invalid_syncs_record`));
    });
});

describe('Log', () => {
    it('should enforce activityLogId when not in dryRun', () => {
        expect(() => {
            new NangoAction({ ...nangoProps, activityLogId: undefined });
        }).toThrowError(new Error('Parameter activityLogId is required when not in dryRun'));
    });

    it('should not fail on null', async () => {
        const nangoAction = new NangoAction({ ...nangoProps, dryRun: true });
        await nangoAction.log(null);
    });

    it('should allow level', async () => {
        const mock = vi.fn(() => ({ response: { status: 200 } }));
        const nangoAction = new NangoAction({ ...nangoProps }, { persistApi: mock as any });

        await nangoAction.log('hello', { level: 'error' });

        expect(mock).toHaveBeenCalledWith({
            data: {
                activityLogId: '1',
                level: 'error',
                msg: 'hello',
                timestamp: expect.any(Number)
            },
            headers: {
                Authorization: 'Bearer ***'
            },
            method: 'POST',
            url: '/environment/1/log'
        });
    });

    it('should enforce type: log message + object + level', async () => {
        const nangoAction = new NangoAction({ ...nangoProps, dryRun: true });
        // @ts-expect-error Level is wrong on purpose, if it's not breaking anymore the type is broken
        await nangoAction.log('hello', { foo: 'bar' }, { level: 'foobar' });
    });

    it('should enforce type: log message +level', async () => {
        const nangoAction = new NangoAction({ ...nangoProps, dryRun: true });
        // @ts-expect-error Level is wrong on purpose, if it's not breaking anymore the type is broken
        await nangoAction.log('hello', { level: 'foobar' });
    });

    it('should enforce type: log message + object', async () => {
        const nangoAction = new NangoAction({ ...nangoProps, dryRun: true });
        await nangoAction.log('hello', { foo: 'bar' });
    });
});

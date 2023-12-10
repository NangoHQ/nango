import { Nango } from '@nangohq/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockErrorManagerReport } from '../utils/error.manager.mocks.js';
import { AuthModes, Template } from '../models/index.js';
import configService from '../services/config.service.js';
import type { CursorPagination, LinkPagination, OffsetPagination } from '../models/Proxy.js';
import { NangoAction } from './sync.js';
import { isValidHttpUrl } from '../utils/utils.js';

vi.mock('@nangohq/node', () => {
    const Nango = vi.fn();
    return { Nango };
});

describe('Pagination', () => {
    const providerConfigKey = 'github';

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
            auth_mode: AuthModes.OAuth2,
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

        // @ts-ignore
        vi.spyOn(configService, 'getProviderConfig').mockImplementation((config: any) => {
            return Promise.resolve('{}');
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
            params: { offset: '3', per_page: 3 },
            paginate: paginationConfigOverride,
            providerConfigKey: 'github'
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

        let actualRecords: any[] = [];
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

        let actualRecords: any[] = [];
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

        let actualRecords: any[] = [];
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

            let actualRecords: any[] = [];
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

        let actualRecords: any[] = [];
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
            auth_mode: AuthModes.OAuth2,
            proxy: { base_url: 'https://api.github.com/', paginate: paginationConfig },
            authorization_url: '',
            token_url: ''
        };
    };
});

import { Nango } from '@nangohq/node';
import type { NextUrlPagination, OffsetPagination } from 'nango';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModes, type Template } from '../models/index.js';
import configService from '../services/config.service.js';
import { CursorPagination, NangoAction } from './sync.js';
import { isValidHttpUrl } from '../utils/utils.js';

vi.mock('@nangohq/node', () => {
    const Nango = vi.fn();
    return { Nango };
});

describe('Pagination', () => {
    const providerConfigKey = 'github';

    const cursorPagination: CursorPagination = {
        type: 'cursor',
        next_cursor_parameter_path: 'metadata.next_cursor',
        cursor_parameter_name: 'cursor',
        limit_parameter_name: 'limit',
        response_data_path: 'issues'
    };
    const offsetPagination: OffsetPagination = {
        type: 'offset',
        limit_parameter_name: 'per_page',
        offset_parameter_name: 'offset',
        response_data_path: 'issues'
    };
    const nextUrlPagination: NextUrlPagination = {
        type: 'link',
        response_data_path: 'issues',
        limit_parameter_name: 'limit',
        link_body_parameter_path: 'metadata.next_cursor'
    };

    const paginationConfigs = [cursorPagination, offsetPagination, nextUrlPagination];

    let nangoAction: NangoAction;
    let nango: Nango;

    beforeEach(() => {
        const config: any = {
            secretKey: 'encrypted',
            serverUrl: 'https://example.com',
            providerConfigKey
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
        vi.spyOn(configService, 'getTemplate').mockImplementation(() => template);

        const expectedErrorMessage: string = `Pagination is not supported for '${providerConfigKey}'. Please, add pagination config to 'providers.yaml' file`;
        await expect(() => nangoAction.paginate({ endpoint: '' }).next()).rejects.toThrowError(expectedErrorMessage);
    });

    it('Sends pagination params in body for POST HTTP method', async () => {
        stubProviderTemplate(cursorPagination);

        // TODO: mock to return at least one more page to check that cursor is passed in body too
        (await import('@nangohq/node')).Nango.prototype.proxy = vi.fn().mockReturnValue({ data: { issues: [] } });

        const endpoint: string = '/issues';

        await nangoAction.paginate({ endpoint, method: 'POST', paginate: { limit: 2 } }).next();

        expect(nango.proxy).toHaveBeenCalledWith({
            method: 'POST',
            endpoint,
            data: { limit: 2 },
            paginate: { limit: 2 }
        });
    });

    it('Overrides template pagination params with ones passed in the proxy config', async () => {
        stubProviderTemplate(cursorPagination);

        (await import('@nangohq/node')).Nango.prototype.proxy = vi
            .fn()
            .mockReturnValueOnce({ data: { issues: [{}, {}, {}] } })
            .mockReturnValueOnce({ data: { issues: [] } });

        const endpoint: string = '/issues';
        const paginationConfigOverride: OffsetPagination = {
            type: 'offset',
            limit_parameter_name: 'per_page',
            limit: 3,
            offset_parameter_name: 'offset',
            response_data_path: 'issues'
        };

        const generator = nangoAction.paginate({ endpoint, paginate: paginationConfigOverride });
        for await (const batch of generator) {
            console.log(batch);
        }

        expect(nango.proxy).toHaveBeenLastCalledWith({
            method: 'GET',
            endpoint,
            params: { offset: '3', per_page: 3 },
            paginate: paginationConfigOverride
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

        const endpoint: string = '/issues';

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

        const endpoint: string = '/issues';

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

        const endpoint: string = '/issues';

        const generator = nangoAction.paginate({ endpoint });

        let actualRecords: any[] = [];
        for await (const batch of generator) {
            actualRecords.push(...batch);
        }

        expect(actualRecords).toStrictEqual(onlyBatch);
    });

    it.each(paginationConfigs)(
        'Extracts records from nested body param for $type pagination type',
        async (paginationConfig: CursorPagination | OffsetPagination | NextUrlPagination) => {
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

            const endpoint: string = '/issues';

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
        stubProviderTemplate(nextUrlPagination);

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

        const endpoint: string = '/issues';

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

    const stubProviderTemplate = (paginationConfig: CursorPagination | OffsetPagination | NextUrlPagination) => {
        const template: Template = buildTemplate(paginationConfig);
        vi.spyOn(configService, 'getTemplate').mockImplementation(() => template);
    };

    const buildTemplate = (paginationConfig: CursorPagination | OffsetPagination | NextUrlPagination): Template => {
        return {
            auth_mode: AuthModes.OAuth2,
            proxy: { base_url: 'https://api.github.com/', paginate: paginationConfig },
            authorization_url: '',
            token_url: ''
        };
    };
});

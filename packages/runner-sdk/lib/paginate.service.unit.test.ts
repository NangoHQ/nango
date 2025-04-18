/**
 * Unit tests for the PaginationService class, specifically focusing on . notation in cursor pagination.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserProvidedProxyConfiguration, CursorPagination } from '@nangohq/types';
import PaginationService from './paginate.service';

describe('PaginationService', () => {
    describe('cursor pagination', () => {
        let config: UserProvidedProxyConfiguration;
        let paginationConfig: CursorPagination;
        let proxy: ReturnType<typeof vi.fn>; // Use ReturnType for type inference

        beforeEach(() => {
            config = {
                endpoint: '/test',
                method: 'POST',
                providerConfigKey: 'test-provider-key'
            };

            paginationConfig = {
                type: 'cursor',
                cursor_name_in_request: 'pagination.starting_after',
                cursor_path_in_response: 'pages.next.starting_after',
                limit: 150,
                limit_name_in_request: 'pagination.per_page',
                response_path: 'data'
            };

            proxy = vi.fn().mockResolvedValue({
                data: {
                    data: [{ id: 1 }],
                    pages: {
                        next: { starting_after: 'next-cursor' }
                    }
                }
            });
        });

        describe('dot notation handling', () => {
            it('should expand dot notation in body parameters', async () => {
                const generator = PaginationService.cursor(
                    config,
                    paginationConfig,
                    { 'pagination.per_page': 150 },
                    true, // passPaginationParamsInBody = true
                    proxy
                );

                await generator.next();

                expect(proxy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: {
                            pagination: {
                                per_page: 150
                            }
                        }
                    })
                );
            });

            it('should handle multiple levels of dot notation', async () => {
                const generator = PaginationService.cursor(
                    config,
                    paginationConfig,
                    {
                        'pagination.per_page': 150,
                        'pagination.cursor.value': 'test-cursor'
                    },
                    true,
                    proxy
                );

                await generator.next();

                expect(proxy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: {
                            pagination: {
                                per_page: 150,
                                cursor: {
                                    value: 'test-cursor'
                                }
                            }
                        }
                    })
                );
            });

            it('should not expand parameters when passing in query params', async () => {
                const generator = PaginationService.cursor(
                    config,
                    paginationConfig,
                    { 'pagination.per_page': 150 },
                    false, // passPaginationParamsInBody = false
                    proxy
                );

                await generator.next();

                expect(proxy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        params: {
                            'pagination.per_page': 150
                        }
                    })
                );
            });

            it('should handle mixed dot notation and regular keys', async () => {
                const generator = PaginationService.cursor(
                    config,
                    paginationConfig,
                    {
                        'pagination.per_page': 150,
                        obj_key: 'value',
                        'nested.key.with.dots': 'nested-value'
                    },
                    true,
                    proxy
                );

                await generator.next();

                expect(proxy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: {
                            pagination: {
                                per_page: 150
                            },
                            obj_key: 'value',
                            nested: {
                                key: {
                                    with: {
                                        dots: 'nested-value'
                                    }
                                }
                            }
                        }
                    })
                );
            });

            it('should handle updates to cursor with dot notation', async () => {
                proxy
                    .mockResolvedValueOnce({
                        data: {
                            data: [{ id: 1 }],
                            pages: {
                                next: { starting_after: 'next-cursor' }
                            }
                        }
                    })
                    .mockResolvedValueOnce({
                        data: {
                            data: [{ id: 2 }],
                            pages: {
                                next: null
                            }
                        }
                    });

                const generator = PaginationService.cursor(config, paginationConfig, { 'pagination.per_page': 150 }, true, proxy);
                await generator.next(); // First page
                await generator.next(); // Second page

                expect(proxy).toHaveBeenNthCalledWith(
                    2,
                    expect.objectContaining({
                        data: {
                            pagination: {
                                per_page: 150,
                                starting_after: 'next-cursor'
                            }
                        }
                    })
                );
            });
        });

        describe('response handling', () => {
            it('should stop pagination when no next cursor', async () => {
                proxy.mockResolvedValueOnce({
                    data: {
                        data: [{ id: 1 }],
                        pages: { next: null }
                    }
                });

                const generator = PaginationService.cursor(config, paginationConfig, { 'pagination.per_page': 150 }, true, proxy);

                const first = await generator.next();
                expect(first.value).toEqual([{ id: 1 }]);

                const second = await generator.next();
                expect(second.done).toBe(true);
            });
        });

        describe('error handling', () => {
            it('should handle undefined response data', async () => {
                proxy.mockResolvedValueOnce({
                    data: {
                        pages: { next: null }
                    }
                });

                const generator = PaginationService.cursor(config, paginationConfig, { 'pagination.per_page': 150 }, true, proxy);

                const result = await generator.next();
                expect(result.done).toBe(true);
            });

            it('should handle invalid cursor values', async () => {
                proxy.mockResolvedValueOnce({
                    data: {
                        data: [{ id: 1 }],
                        pages: {
                            next: { starting_after: '   ' } // Empty string with spaces
                        }
                    }
                });

                const generator = PaginationService.cursor(config, paginationConfig, { 'pagination.per_page': 150 }, true, proxy);

                const first = await generator.next();
                expect(first.value).toEqual([{ id: 1 }]);

                const second = await generator.next();
                expect(second.done).toBe(true);
            });
        });
    });
});

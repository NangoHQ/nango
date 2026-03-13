import { describe, expect, it } from 'vitest';

import { stringifyError } from './errors.js';

describe('stringifyError', () => {
    describe('stringifyError', () => {
        it('should stringify Error with name and message, filtering custom fields', () => {
            const err: any = new Error('Test error');
            err.customField = 'filtered';
            const parsed = JSON.parse(stringifyError(err));

            expect(parsed).toEqual({ name: 'Error', message: 'Test error' });
        });

        it('should include stack when opts.stack is true', () => {
            const err = new Error('Test error');
            err.stack = 'Error: Test error\n    at test.js:1:1';
            const parsed = JSON.parse(stringifyError(err, { stack: true }));

            expect(parsed).toHaveProperty('stack');
        });

        it('should include cause when opts.cause is true', () => {
            const err = new Error('Test error');
            err.cause = 'Underlying cause';
            const parsed = JSON.parse(stringifyError(err, { cause: true }));

            expect(parsed).toHaveProperty('cause');
        });

        it('should handle non-Error values without throwing', () => {
            expect(() => stringifyError('String error')).not.toThrow();
            expect(() => stringifyError(null)).not.toThrow();
            expect(() => stringifyError(404)).not.toThrow();
        });

        it('should not include provider_error_payload if no whitelisted fields match', () => {
            const err: any = {
                response: {
                    data: {
                        timestamp: '2024-01-01',
                        request_id: 'abc123'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed).not.toHaveProperty('provider_error_payload');
        });

        it('should not extract provider_error_payload for invalid response.data structures', () => {
            const cases = [{ response: { data: null } }, { response: { data: 'string response' } }, { response: { data: { error: {} } } }];

            cases.forEach((err) => {
                expect(JSON.parse(stringifyError(err))).not.toHaveProperty('provider_error_payload');
            });
        });

        it('should extract top-level string error fields from response.data', () => {
            const err: any = {
                response: {
                    data: {
                        error: 'invalid_grant',
                        error_description: 'Token has expired'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed.provider_error_payload).toEqual({
                error: 'invalid_grant',
                error_description: 'Token has expired'
            });
        });

        it('should extract top-level message/detail fields from response.data when no nested error object', () => {
            const err: any = {
                response: {
                    data: {
                        message: 'Not found',
                        detail: 'Resource does not exist',
                        timestamp: '2024-01-01'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed.provider_error_payload).toEqual({
                message: 'Not found',
                detail: 'Resource does not exist'
            });
        });

        it('should extract all matching PROVIDER_ERROR_MESSAGE_FIELDS from response.data', () => {
            const err: any = {
                response: {
                    data: {
                        error: 'unauthorized',
                        error_message: 'Access denied',
                        details: 'Insufficient permissions',
                        reason: 'scope_missing',
                        description: 'Required scope not granted',
                        request_id: 'abc123'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed.provider_error_payload).toEqual({
                error: 'unauthorized',
                error_message: 'Access denied',
                details: 'Insufficient permissions',
                reason: 'scope_missing',
                description: 'Required scope not granted'
            });
        });

        it('should skip object values in response.data and only extract primitive whitelisted fields', () => {
            const err: any = {
                response: {
                    data: {
                        error: { message: 'Nested error message', code: 401 },
                        error_description: 'Top-level description'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            // 'error' is an object so it's skipped, only the primitive field is extracted
            expect(parsed.provider_error_payload).toEqual({
                error_description: 'Top-level description'
            });
        });

        it('should not set provider_error_payload when response.data has no PROVIDER_ERROR_MESSAGE_FIELDS', () => {
            const err: any = {
                response: {
                    data: {
                        code: 404,
                        timestamp: '2024-01-01',
                        requestId: 'abc123'
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed).not.toHaveProperty('provider_error_payload');
        });

        it('should extract Boom-style data.payload', () => {
            const err: any = {
                data: {
                    payload: {
                        error: 'boom_error',
                        message: 'Something went wrong',
                        statusCode: 400
                    }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed.provider_error_payload).toEqual({
                error: 'boom_error',
                message: 'Something went wrong',
                statusCode: 400
            });
        });

        it('should prioritize axios error over Boom payload', () => {
            const err: any = {
                response: {
                    data: {
                        error: 'invalid_grant',
                        message: 'Axios error'
                    }
                },
                data: {
                    payload: { message: 'Boom error' }
                }
            };

            const parsed = JSON.parse(stringifyError(err));
            expect(parsed.provider_error_payload).toEqual({ error: 'invalid_grant', message: 'Axios error' });
        });

        it('should format with pretty printing when opts.pretty is true', () => {
            const result = stringifyError(new Error('Test'), { pretty: true });
            expect(result.split('\n').length).toBeGreaterThan(1);
        });

        describe('stringifyError performance', () => {
            it('should complete within acceptable time for 100,000 iterations', () => {
                const testCases = [
                    // Simple error
                    { name: 'Simple Error', error: new Error('Simple error') },

                    // Axios-style error
                    {
                        name: 'Axios Error',
                        error: {
                            name: 'AxiosError',
                            message: 'Request failed',
                            response: {
                                data: {
                                    error: {
                                        message: 'Provider error',
                                        error_description: 'Something went wrong',
                                        code: 'INVALID_REQUEST'
                                    }
                                }
                            }
                        }
                    },

                    // Boom-style error
                    {
                        name: 'Boom Error',
                        error: {
                            name: 'BoomError',
                            message: 'Boom error',
                            data: {
                                payload: {
                                    message: 'Payload error'
                                }
                            }
                        }
                    }
                ];

                const iterations = 100_000;
                const maxAvgTimePerCall = 0.01;

                for (const { error } of testCases) {
                    const start = performance.now();

                    for (let i = 0; i < iterations; i++) {
                        stringifyError(error);
                    }

                    const end = performance.now();
                    const totalTime = end - start;
                    const avgTime = totalTime / iterations;

                    expect(avgTime).toBeLessThan(maxAvgTimePerCall);
                }
            });
        });
    });
});

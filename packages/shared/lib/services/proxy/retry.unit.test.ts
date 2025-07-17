import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { getProxyRetryFromErr, getRetryFromBody, getRetryFromHeader } from './retry.js';
import { getDefaultProxy } from './utils.test.js';

import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Merge } from 'type-fest';

function getDefaultError(value: Merge<Partial<AxiosError>, { response?: Partial<AxiosResponse> }>): AxiosError {
    const err = new AxiosError('test');
    err.response = {
        status: 429,
        data: {},
        headers: {},
        statusText: 'Too Many Requests',
        ...value.response,
        config: {} as InternalAxiosRequestConfig
    };
    return err;
}

describe('getProxyRetryFromErr', () => {
    describe('at', () => {
        it('should retry at', () => {
            const nowInSecs = Date.now() / 1000;
            const mockAxiosError = getDefaultError({
                response: {
                    headers: { 'x-rateLimit-reset': nowInSecs + 1 }
                }
            });
            const res = getRetryFromHeader({ err: mockAxiosError, type: 'at', retryHeader: 'x-rateLimit-reset' });
            expect(res).toStrictEqual({ found: true, reason: 'at', wait: 2000 });
        });

        it('should ignore invalid at', () => {
            const mockAxiosError = getDefaultError({
                response: {
                    headers: { 'x-rateLimit-reset': 24 }
                }
            });

            const res = getRetryFromHeader({ err: mockAxiosError, type: 'at', retryHeader: 'x-rateLimit-reset' });
            expect(res).toStrictEqual({ found: false, reason: 'at:header_invalid_wait' });
        });

        it('should retry at (ms)', () => {
            const nowInMs = Date.now();
            const mockAxiosError = getDefaultError({
                response: {
                    headers: { 'x-rateLimit-reset-ms': nowInMs + 1000 }
                }
            });
            const res = getRetryFromHeader({ err: mockAxiosError, type: 'at', retryHeader: 'x-rateLimit-reset-ms' });
            expect(res).toStrictEqual({ found: true, reason: 'at', wait: 1000 });
        });
    });

    describe('after', () => {
        it('should retry after', () => {
            const mockAxiosError = getDefaultError({
                response: {
                    headers: { 'x-rateLimit-reset-after': '1' }
                }
            });

            const res = getRetryFromHeader({ err: mockAxiosError, type: 'after', retryHeader: 'x-rateLimit-reset-after' });
            expect(res).toStrictEqual({ found: true, reason: 'after', wait: 1000 });
        });
    });

    it('should fail to find header', () => {
        const mockAxiosError = getDefaultError({});

        const resAt = getRetryFromHeader({ err: mockAxiosError, type: 'at', retryHeader: 'x-rateLimit-reset' });
        expect(resAt).toStrictEqual({ found: false, reason: 'at:no_header' });

        const resAfter = getRetryFromHeader({ err: mockAxiosError, type: 'after', retryHeader: 'x-rateLimit-reset-after' });
        expect(resAfter).toStrictEqual({ found: false, reason: 'after:no_header' });
    });
});

describe('getProxyRetryFromErr', () => {
    it('should not retry unknown error', () => {
        const res = getProxyRetryFromErr({ err: new Error(), proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: false, reason: 'unknown_error' });
    });

    it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'])('should retry network error "%s"', (value) => {
        const err = new AxiosError('', value);
        const res = getProxyRetryFromErr({ err, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: true, reason: 'network_error' });
    });

    it.each([200, 300, 400])('should not retry some status code "%d"', (value) => {
        const mockAxiosError = getDefaultError({ response: { status: value } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: false, reason: 'not_retryable' });
    });

    it.each([500, 501, 429])('should retry some status code "%d"', (value) => {
        const mockAxiosError = getDefaultError({ response: { status: value } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: true, reason: `status_code_${value}` });
    });

    it('should use retryOn even on valid status code', () => {
        const mockAxiosError = getDefaultError({ response: { status: 200 } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({ retryOn: [200] }) });
        expect(res).toStrictEqual({ retry: true, reason: 'retry_on_200' });
    });

    describe('provider proxy', () => {
        describe('error_code', () => {
            it('should use custom provider config', () => {
                const mockAxiosError = getDefaultError({ response: { status: 200 } });
                const res = getProxyRetryFromErr({
                    err: mockAxiosError,
                    proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: '', retry: { error_code: 200 } } } })
                });
                expect(res).toStrictEqual({ retry: true, reason: 'provider_error_code' });
            });
        });

        describe('remaining', () => {
            it('should use custom provider config', () => {
                const mockAxiosError = getDefaultError({ response: { status: 200, headers: { 'x-top': '0' } } });
                const res = getProxyRetryFromErr({
                    err: mockAxiosError,
                    proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: '', retry: { remaining: 'x-top' } } } })
                });
                expect(res).toStrictEqual({ retry: true, reason: 'provider_remaining' });
            });

            it('should only work when remaining is 0', () => {
                const mockAxiosError = getDefaultError({ response: { status: 200, headers: { 'x-top': '1' } } });
                const res = getProxyRetryFromErr({
                    err: mockAxiosError,
                    proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: '', retry: { remaining: 'x-top' } } } })
                });
                expect(res).toStrictEqual({ retry: false, reason: 'not_retryable' });
            });
        });
    });
});

describe('getRetryFromBody', () => {
    it('should retry based on body (at strategy)', () => {
        const futureDate = new Date(Date.now() + 2000).toISOString();
        const body = {
            error: {
                message: `User-rate limit exceeded.  Retry after ${futureDate}`
            }
        };

        const mockAxiosError = getDefaultError({
            response: {
                status: 429,
                data: body
            }
        });

        const res = getRetryFromBody({
            err: mockAxiosError,
            retryPath: 'error.message',
            retryRegex: /User-rate limit exceeded\. +Retry after (.+)/,
            type: 'at'
        });

        expect(res.found).toBe(true);
        expect(res.reason).toBe('in_body:at');
        if (res.found) {
            expect(res.wait).toBeGreaterThanOrEqual(1000);
            expect(res.wait).toBeLessThanOrEqual(2000);
        }
    });

    it('should retry based on body (at strategy) with epoch timestamp', () => {
        const futureTime = Math.floor(Date.now() / 1000) + 2;
        const body = {
            error: {
                message: `Rate limited. Try again at ${futureTime}`
            }
        };

        const mockAxiosError = getDefaultError({
            response: {
                status: 429,
                data: body
            }
        });

        const res = getRetryFromBody({
            err: mockAxiosError,
            retryPath: 'error.message',
            retryRegex: /Rate limited\. Try again at (.+)/,
            type: 'at'
        });

        expect(res.found).toBe(true);
        expect(res.reason).toBe('in_body:at');
        if (res.found) {
            const tolerance = 100;
            expect(res.wait).toBeGreaterThanOrEqual(2000 - tolerance);
            expect(res.wait).toBeLessThanOrEqual(2000 + tolerance);
        }
    });

    it('should retry based on body (after strategy)', () => {
        const seconds = 3;
        const body = {
            error: {
                message: `User-rate limit exceeded.  Retry after ${seconds} seconds`
            }
        };

        const mockAxiosError = getDefaultError({
            response: {
                status: 429,
                data: body
            }
        });

        const res = getRetryFromBody({
            err: mockAxiosError,
            retryPath: 'error.message',
            retryRegex: /User-rate limit exceeded\. +Retry after (.+) seconds/,
            type: 'after'
        });

        expect(res.found).toBe(true);
        expect(res.reason).toBe('in_body:after');
        if (res.found) {
            expect(res.wait).toBeGreaterThanOrEqual(3000);
            expect(res.wait).toBeLessThanOrEqual(3100);
        }
    });

    it('should not retry if value does not match', () => {
        const body = {
            error: {
                message: `Something else entirely`
            }
        };

        const mockAxiosError = getDefaultError({
            response: {
                status: 429,
                data: body
            }
        });

        const res = getRetryFromBody({
            err: mockAxiosError,
            retryPath: 'error.message',
            retryRegex: /User-rate limit exceeded\. Retry after (.+)/,
            type: 'at'
        });

        expect(res).toStrictEqual({ found: false, reason: 'in_body:no_match' });
    });
});

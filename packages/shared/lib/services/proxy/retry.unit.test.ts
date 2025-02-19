import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { getProxyRetryFromErr, getRetryFromHeader } from './retry.js';
import { getDefaultProxy } from './utils.test.js';
import type { Merge } from 'type-fest';

function getDefaultError(value: Merge<Partial<AxiosError>, { response?: Partial<AxiosResponse> }>): AxiosError {
    return {
        isAxiosError: true,
        message: 'test',
        name: 'test',
        toJSON() {
            return {};
        },
        ...value,
        response: {
            status: 429,
            data: {},
            headers: {},
            statusText: 'Too Many Requests',
            ...value.response,
            config: {} as InternalAxiosRequestConfig
        } as AxiosResponse
    } satisfies AxiosError;
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
            expect(res).toStrictEqual({ found: false, reason: 'at:invalid_wait' });
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
        const err = new Error();
        // @ts-expect-error yes I know
        err.code = value;
        const res = getProxyRetryFromErr({ err, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: false, reason: 'unknown_error' });
    });

    it.each([200, 300, 400])('should not retry some status code "%d"', (value) => {
        const mockAxiosError = getDefaultError({ response: { status: value } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: false, reason: 'not_retryable' });
    });

    it.each([500, 501, 429])('should retry some status code "%d"', (value) => {
        const mockAxiosError = getDefaultError({ response: { status: value } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({}) });
        expect(res).toStrictEqual({ retry: true, reason: 'status_code' });
    });

    it('should retryOn', () => {
        const mockAxiosError = getDefaultError({ response: { status: 200 } });
        const res = getProxyRetryFromErr({ err: mockAxiosError, proxyConfig: getDefaultProxy({ retryOn: [200] }) });
        expect(res).toStrictEqual({ retry: true, reason: 'status_code' });
    });

    describe('provider proxy', () => {
        describe('error_code', () => {
            it('should use custom provider config', () => {
                const mockAxiosError = getDefaultError({ response: { status: 200 } });
                const res = getProxyRetryFromErr({
                    err: mockAxiosError,
                    proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: '', retry: { error_code: 200 } } } })
                });
                expect(res).toStrictEqual({ retry: true, reason: 'status_code' });
            });
        });

        describe('remaining', () => {
            it('should use custom provider config', () => {
                const mockAxiosError = getDefaultError({ response: { status: 200, headers: { 'x-top': '0' } } });
                const res = getProxyRetryFromErr({
                    err: mockAxiosError,
                    proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: '', retry: { remaining: 'x-top' } } } })
                });
                expect(res).toStrictEqual({ retry: true, reason: 'status_code' });
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

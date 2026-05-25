import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NangoProps } from '@nangohq/types';

function makeProps(): NangoProps {
    // Only the fields used by the base constructor are required for these tests.
    return {
        connectionId: 'connection-id',
        environmentId: 1,
        team: { id: 1, name: 'test-team' },
        providerConfigKey: 'provider-config-key',
        activityLogId: 'activity-log-id',
        runnerFlags: {},
        scriptType: 'action',
        isCLI: false
    } as unknown as NangoProps;
}

interface TransferRecord {
    bytesSent: number;
    bytesReceived: number;
}

async function makeActionInstance() {
    const mod = await import('./action.js');
    const { NangoActionBase } = mod;

    const transfers: TransferRecord[] = [];

    class TestAction extends NangoActionBase {
        // minimal shape for places that may touch user agent
        nango = { userAgent: 'runner-sdk-test' } as any;

        protected override recordUncontrolledFetchTransfer(params: TransferRecord): void {
            transfers.push(params);
        }

        proxy(): Promise<any> {
            throw new Error('not implemented');
        }

        log(): any {
            return;
        }

        triggerSync(): Promise<any> {
            throw new Error('not implemented');
        }

        startSync(): Promise<any> {
            throw new Error('not implemented');
        }

        tryAcquireLock(): Promise<boolean> {
            return Promise.resolve(false);
        }

        async releaseLock(): Promise<boolean> {
            return Promise.resolve(false);
        }

        async releaseAllLocks(): Promise<void> {
            return Promise.resolve();
        }

        async getCheckpoint(): Promise<any> {
            return Promise.resolve(null);
        }

        async saveCheckpoint(): Promise<void> {
            return Promise.resolve();
        }

        async clearCheckpoint(): Promise<void> {
            return Promise.resolve();
        }
    }

    return { action: new TestAction(makeProps()), transfers };
}

describe('uncontrolledFetch', () => {
    beforeEach(() => {
        vi.resetModules();
        delete process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'];
        delete process.env['AWS_LAMBDA_RUNTIME_API'];
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        delete process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'];
        delete process.env['AWS_LAMBDA_RUNTIME_API'];
    });

    it('rejects redirects to non-HTTP(S) schemes', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'data:text/plain,hello' } }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();

        await expect(action.uncontrolledFetch({ url: new URL('https://example.com/start') })).rejects.toMatchObject({
            type: 'action_script_runtime_error',
            payload: { code: 'invalid_redirect' }
        });
    });

    it('blocks a redirect hop to a denylisted host', async () => {
        process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'] = JSON.stringify(['metadata.google.internal']);
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://metadata.google.internal/latest/meta-data/' } }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();

        await expect(
            action.uncontrolledFetch({
                url: new URL('https://example.com/start')
            })
        ).rejects.toMatchObject({ type: 'action_script_runtime_error', payload: { code: 'url_not_allowed' } });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('strips sensitive headers when redirecting to a different origin', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://b.example/next' } }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();

        const res = await action.uncontrolledFetch({
            url: new URL('https://a.example/start'),
            headers: { Authorization: 'Bearer secret', 'X-Test': '1' }
        });

        expect(await res.text()).toBe('ok');
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const secondCallInit = fetchMock.mock.calls[1]![1] as RequestInit;
        const headers = secondCallInit.headers as Headers;
        expect(headers.get('authorization')).toBeNull();
        expect(headers.get('cookie')).toBeNull();
        expect(headers.get('proxy-authorization')).toBeNull();
        expect(headers.get('x-test')).toBe('1');
    });

    it('preserves redirect response body when status is 3xx without Location', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('diagnostic payload', { status: 302 }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();
        const res = await action.uncontrolledFetch({ url: new URL('https://example.com/redirect-without-location') });

        expect(res.status).toBe(302);
        expect(await res.text()).toBe('diagnostic payload');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves non-POST methods on 301/302 redirects (e.g. PUT)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: 'https://example.com/next' } }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();
        const res = await action.uncontrolledFetch({
            url: new URL('https://example.com/start'),
            method: 'PUT',
            body: 'body',
            headers: { 'content-type': 'text/plain' }
        });

        expect(await res.text()).toBe('ok');

        const secondCallInit = fetchMock.mock.calls[1]![1] as RequestInit;
        expect(secondCallInit.method).toBe('PUT');
        expect(secondCallInit.body).toBe('body');
        expect((secondCallInit.headers as Headers).get('content-type')).toBe('text/plain');
    });

    it('rewrites POST to GET on 302 and drops request-body headers', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://example.com/next' } }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();
        const res = await action.uncontrolledFetch({
            url: new URL('https://example.com/start'),
            method: 'POST',
            body: 'hello',
            headers: {
                'content-type': 'application/json',
                'content-language': 'en',
                'content-encoding': 'gzip',
                'x-test': '1'
            }
        });

        expect(await res.text()).toBe('ok');

        const secondCallInit = fetchMock.mock.calls[1]![1] as RequestInit;
        expect(secondCallInit.method).toBe('GET');
        expect(secondCallInit.body).toBeUndefined();

        const headers = secondCallInit.headers as Headers;
        expect(headers.get('content-type')).toBeNull();
        expect(headers.get('content-language')).toBeNull();
        expect(headers.get('content-encoding')).toBeNull();
        expect(headers.get('x-test')).toBe('1');
    });

    it('preserves GET on 303 redirects (no forced rewrite)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 303, headers: { Location: 'https://example.com/next' } }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action } = await makeActionInstance();
        const res = await action.uncontrolledFetch({
            url: new URL('https://example.com/start'),
            method: 'GET',
            headers: { authorization: 'Bearer secret' }
        });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const secondCallInit = fetchMock.mock.calls[1]![1] as RequestInit;
        expect(secondCallInit.method).toBe('GET');
        expect(secondCallInit.body).toBeUndefined();
    });
});

describe('uncontrolledFetch byte metering helpers', () => {
    it('parseContentLength returns null for missing header', async () => {
        const { parseContentLength } = await import('./uncontrolledFetch.js');
        expect(parseContentLength(new Headers())).toBeNull();
    });

    it('parseContentLength returns null for non-numeric value', async () => {
        const { parseContentLength } = await import('./uncontrolledFetch.js');
        expect(parseContentLength(new Headers({ 'content-length': 'abc' }))).toBeNull();
    });

    it('parseContentLength returns null for negative value', async () => {
        const { parseContentLength } = await import('./uncontrolledFetch.js');
        expect(parseContentLength(new Headers({ 'content-length': '-1' }))).toBeNull();
    });

    it('parseContentLength returns integer for valid value', async () => {
        const { parseContentLength } = await import('./uncontrolledFetch.js');
        expect(parseContentLength(new Headers({ 'content-length': '42' }))).toBe(42);
        expect(parseContentLength(new Headers({ 'content-length': '0' }))).toBe(0);
    });

    it('countRequestBytes includes body bytes', async () => {
        const { countRequestBytes } = await import('./uncontrolledFetch.js');
        const body = 'hello world';
        const withBody = countRequestBytes(new Headers(), body);
        const withoutBody = countRequestBytes(new Headers());
        expect(withBody - withoutBody).toBe(Buffer.byteLength(body, 'utf8'));
    });

    it('countRequestBytes includes caller-set header name and value bytes', async () => {
        const { countRequestBytes } = await import('./uncontrolledFetch.js');
        const headers = new Headers({ 'x-custom': 'value', 'content-type': 'application/json' });
        const withHeaders = countRequestBytes(headers);
        const withoutHeaders = countRequestBytes(new Headers());
        const expectedDelta =
            Buffer.byteLength('x-custom', 'utf8') +
            Buffer.byteLength('value', 'utf8') +
            Buffer.byteLength('content-type', 'utf8') +
            Buffer.byteLength('application/json', 'utf8');
        expect(withHeaders - withoutHeaders).toBe(expectedDelta);
    });

    it('countHeaderBytes sums response header name and value bytes', async () => {
        const { countHeaderBytes } = await import('./uncontrolledFetch.js');
        const headers = new Headers({ 'content-type': 'application/json', 'x-req-id': 'abc' });
        const bytes = countHeaderBytes(headers);
        const expected =
            Buffer.byteLength('content-type', 'utf8') +
            Buffer.byteLength('application/json', 'utf8') +
            Buffer.byteLength('x-req-id', 'utf8') +
            Buffer.byteLength('abc', 'utf8');
        expect(bytes).toBe(expected);
    });

    it('tapResponseStreamAndCount returns original response when body is null', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const response = new Response(null);
        const callback = vi.fn();
        const returned = tapResponseStreamAndCount(response, callback);
        expect(returned).toBe(response);
        expect(callback).not.toHaveBeenCalled();
    });

    it('tapResponseStreamAndCount wraps stream and calls callback with bytes on consumption', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const body = 'streamed content';
        const response = new Response(body);
        const calls: { bytes: number }[] = [];
        const callback = (p: { bytes: number }) => calls.push(p);
        const wrapped = tapResponseStreamAndCount(response, callback);
        expect(wrapped).not.toBe(response);
        const text = await wrapped.text();
        expect(text).toBe(body);
        expect(calls.length).toBe(1);
        expect(calls[0]!.bytes).toBe(Buffer.byteLength(body, 'utf8'));
    });

    it('tapResponseStreamAndCount calls callback with 0 bytes for empty body stream', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const response = new Response('');
        const calls: { bytes: number }[] = [];
        const callback = (p: { bytes: number }) => calls.push(p);
        const wrapped = tapResponseStreamAndCount(response, callback);
        await wrapped.text();
        expect(calls.length).toBe(1);
        expect(calls[0]!.bytes).toBe(0);
    });

    it('tapResponseStreamAndCount preserves status and headers on wrapped response', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const response = new Response('body', { status: 206, headers: { 'x-custom': 'val' } });
        const wrapped = tapResponseStreamAndCount(response, vi.fn());
        expect(wrapped.status).toBe(206);
        expect(wrapped.headers.get('x-custom')).toBe('val');
    });

    it('tapResponseStreamAndCount preserves url and type from original response', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const response = new Response('body');
        const wrapped = tapResponseStreamAndCount(response, vi.fn());
        expect(wrapped.url).toBe(response.url);
        expect(wrapped.type).toBe(response.type);
    });

    it('tapResponseStreamAndCount clone reads body correctly', async () => {
        const { tapResponseStreamAndCount } = await import('./uncontrolledFetch.js');
        const body = 'cloned content';
        const response = new Response(body);
        const wrapped = tapResponseStreamAndCount(response, vi.fn());
        const cloned = wrapped.clone();
        expect(await cloned.text()).toBe(body);
    });
});

describe('uncontrolledFetch transfer metering', () => {
    beforeEach(() => {
        vi.resetModules();
        delete process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'];
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('records request and response transfer bytes for a simple GET', async () => {
        const responseBody = 'hello';
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(responseBody, {
                status: 200,
                headers: { 'content-length': String(Buffer.byteLength(responseBody, 'utf8')) }
            })
        );
        vi.stubGlobal('fetch', fetchMock as any);

        const { action, transfers } = await makeActionInstance();
        await action.uncontrolledFetch({
            url: new URL('https://example.com/data'),
            headers: { 'x-test': '1' }
        });

        expect(transfers.length).toBe(1);
        expect(transfers[0]!.bytesSent).toBeGreaterThan(0);
        expect(transfers[0]!.bytesReceived).toBeGreaterThanOrEqual(Buffer.byteLength(responseBody, 'utf8'));
    });

    it('records request bytes for POST with body', async () => {
        const body = '{"key":"value"}';
        const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200, headers: { 'content-length': '2' } }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action, transfers } = await makeActionInstance();
        await action.uncontrolledFetch({
            url: new URL('https://example.com/api'),
            method: 'POST',
            body,
            headers: { 'content-type': 'application/json' }
        });

        expect(transfers.length).toBe(1);
        expect(transfers[0]!.bytesSent).toBeGreaterThanOrEqual(Buffer.byteLength(body, 'utf8'));
    });

    it('records transfer bytes for each hop on redirect, POST body dropped on 302', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://example.com/next' } }))
            .mockResolvedValueOnce(new Response('done', { status: 200, headers: { 'content-length': '4' } }));
        vi.stubGlobal('fetch', fetchMock as any);

        const { action, transfers } = await makeActionInstance();
        await action.uncontrolledFetch({
            url: new URL('https://example.com/start'),
            method: 'POST',
            body: 'hello',
            headers: { 'content-type': 'text/plain', 'x-hop': '1' }
        });

        // Two records: one per hop
        expect(transfers.length).toBe(2);

        // First hop is POST with body — more bytesSent than second hop (GET, no body)
        expect(transfers[0]!.bytesSent).toBeGreaterThan(transfers[1]!.bytesSent);
        expect(transfers[1]!.bytesSent).toBeGreaterThan(0);

        // Both hops have response headers
        expect(transfers[0]!.bytesReceived).toBeGreaterThan(0);
        expect(transfers[1]!.bytesReceived).toBeGreaterThan(0);
    });

    it('records streamed response body bytes when Content-Length is absent', async () => {
        const responseBody = 'streaming data here';
        const fetchMock = vi.fn().mockResolvedValue(new Response(responseBody)); // no Content-Length
        vi.stubGlobal('fetch', fetchMock as any);

        const { action, transfers } = await makeActionInstance();
        const res = await action.uncontrolledFetch({ url: new URL('https://example.com/stream') });

        // Consume body to trigger streamed byte count
        await res.text();

        // Two records: (1) request+headers emitted immediately, (2) body bytes on stream flush
        expect(transfers.length).toBe(2);
        expect(transfers[0]!.bytesSent).toBeGreaterThanOrEqual(0);
        expect(transfers[0]!.bytesReceived).toBeGreaterThan(0);
        expect(transfers[1]!.bytesSent).toBe(0);
        expect(transfers[1]!.bytesReceived).toBe(Buffer.byteLength(responseBody, 'utf8'));
    });

    it('base class no-op hook does not throw and emits no transfers when not overridden', async () => {
        const mod = await import('./action.js');
        const { NangoActionBase } = mod;

        class NoOpTestAction extends NangoActionBase {
            nango = { userAgent: 'test' } as any;
            proxy(): Promise<any> {
                throw new Error('not implemented');
            }
            log(): any {
                return;
            }
            triggerSync(): Promise<any> {
                throw new Error('not implemented');
            }
            startSync(): Promise<any> {
                throw new Error('not implemented');
            }
            tryAcquireLock(): Promise<boolean> {
                return Promise.resolve(false);
            }
            releaseLock(): Promise<boolean> {
                return Promise.resolve(false);
            }
            releaseAllLocks(): Promise<void> {
                return Promise.resolve();
            }
            getCheckpoint(): Promise<any> {
                return Promise.resolve();
            }
            saveCheckpoint(): Promise<void> {
                return Promise.resolve();
            }
            clearCheckpoint(): Promise<void> {
                return Promise.resolve();
            }
        }

        const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200, headers: { 'content-length': '2' } }));
        vi.stubGlobal('fetch', fetchMock as any);

        const props = {
            connectionId: 'c',
            environmentId: 1,
            team: { id: 1, name: 'test-team' },
            providerConfigKey: 'p',
            activityLogId: 'a',
            runnerFlags: {},
            scriptType: 'action' as const,
            isCLI: false
        } as unknown as NangoProps;

        const action = new NoOpTestAction(props);
        // Should not throw even though hook is a no-op
        await expect(action.uncontrolledFetch({ url: new URL('https://example.com/') })).resolves.toBeDefined();
    });
});

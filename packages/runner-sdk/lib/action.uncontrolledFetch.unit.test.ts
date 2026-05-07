import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NangoProps } from '@nangohq/types';

function makeProps(): NangoProps {
    // Only the fields used by the base constructor are required for these tests.
    return {
        connectionId: 'connection-id',
        environmentId: 1,
        providerConfigKey: 'provider-config-key',
        activityLogId: 'activity-log-id',
        runnerFlags: {},
        scriptType: 'action',
        isCLI: false
    } as unknown as NangoProps;
}

async function makeActionInstance() {
    const mod = await import('./action.js');
    const { NangoActionBase } = mod;

    class TestAction extends NangoActionBase {
        // minimal shape for places that may touch user agent
        nango = { userAgent: 'runner-sdk-test' } as any;

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

    return { action: new TestAction(makeProps()) };
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
});

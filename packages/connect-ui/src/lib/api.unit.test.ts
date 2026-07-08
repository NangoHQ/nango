import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getConnectSession, getIntegrations, getProvider } from './api.js';
import { useGlobal } from './store.js';

const BASE_PATH_API_URL = 'https://example.com/base/path';

function mockFetchOnce(status = 200, body: unknown = { data: {} }) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('fetchApi base path handling', () => {
    beforeEach(() => {
        useGlobal.getState().setSessionToken('test-session-token');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requests a bare-origin apiURL without altering the path', async () => {
        useGlobal.getState().setApiURL('https://api.nango.dev');
        const fetchMock = mockFetchOnce();

        await getConnectSession();

        const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
        expect(requestedUrl.toString()).toBe('https://api.nango.dev/connect/session');
    });

    it('preserves a self-hosted base path prefix on /connect/session', async () => {
        useGlobal.getState().setApiURL(BASE_PATH_API_URL);
        const fetchMock = mockFetchOnce();

        await getConnectSession();

        const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
        expect(requestedUrl.toString()).toBe(`${BASE_PATH_API_URL}/connect/session`);
    });

    it('preserves a self-hosted base path prefix on /integrations', async () => {
        useGlobal.getState().setApiURL(BASE_PATH_API_URL);
        const fetchMock = mockFetchOnce();

        await getIntegrations();

        const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
        expect(requestedUrl.toString()).toBe(`${BASE_PATH_API_URL}/integrations`);
    });

    it('preserves a self-hosted base path prefix on parameterized routes (/providers/:provider)', async () => {
        useGlobal.getState().setApiURL(BASE_PATH_API_URL);
        const fetchMock = mockFetchOnce();

        await getProvider({ provider: 'jira' });

        const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
        expect(requestedUrl.toString()).toBe(`${BASE_PATH_API_URL}/providers/jira`);
    });

    it('preserves a base path prefix with a trailing slash', async () => {
        useGlobal.getState().setApiURL(`${BASE_PATH_API_URL}/`);
        const fetchMock = mockFetchOnce();

        await getIntegrations();

        const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
        expect(requestedUrl.toString()).toBe(`${BASE_PATH_API_URL}/integrations`);
    });
});

import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cliFetch } from '../tls.js';
import { pullFromCatalog, pullFunction } from './pull.service.js';

vi.mock('../tls.js', () => ({ cliFetch: vi.fn() }));

const fetchMock = vi.mocked(cliFetch);

function mockResponse(status: number, body: unknown) {
    fetchMock.mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

function mockFsForWriting() {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue('');
    return writeSpy;
}

function requestedUrl(): URL {
    return fetchMock.mock.calls[0]![0] as URL;
}

function loggedMessages(consoleSpy: ReturnType<typeof vi.spyOn>): string {
    return consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
}

function stubSecretKeys(keys: Record<string, string>) {
    for (const variable of Object.keys(process.env)) {
        if (variable.startsWith('NANGO_SECRET_KEY')) {
            vi.stubEnv(variable, undefined);
        }
    }
    vi.stubEnv('NANGO_SECRET_KEY', undefined);
    for (const [variable, value] of Object.entries(keys)) {
        vi.stubEnv(variable, value);
    }
}

function requestedSecretKeys(): string[] {
    return fetchMock.mock.calls.map((call) => (call[1]!.headers as Record<string, string>)['authorization']!);
}

const baseOptions = {
    fullPath: '/project',
    environmentName: 'dev',
    integrationId: 'github',
    name: 'list-repos',
    debug: false,
    force: false,
    autoConfirm: true,
    interactive: false
};

describe.each([
    { pull: pullFunction, endpoint: '/integrations/github/functions/list-repos/code' },
    { pull: pullFromCatalog, endpoint: '/providers/github/templates/list-repos/code' }
])('$pull.name', ({ pull, endpoint }) => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        stubSecretKeys({ NANGO_SECRET_KEY_DEV: 'secret-dev' });
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fetchMock.mockReset();
    });

    it('writes the function returned by the server', async () => {
        mockResponse(200, { type: 'action', code: 'action code' });
        const writeSpy = mockFsForWriting();

        const success = await pull(baseOptions);

        expect(success).toBe(true);
        expect(requestedUrl().pathname).toBe(endpoint);
        expect(fetchMock.mock.calls[0]![1]).toMatchObject({ headers: { authorization: 'Bearer secret-dev' } });
        expect(writeSpy.mock.calls).toEqual([
            ['/project/github/actions/list-repos.ts', 'action code', 'utf-8'],
            ['/project/index.ts', "\nimport './github/actions/list-repos.js';\n", 'utf-8']
        ]);
    });

    it('passes the type to disambiguate', async () => {
        mockResponse(200, { type: 'sync', code: 'sync code' });
        const writeSpy = mockFsForWriting();

        const success = await pull({ ...baseOptions, type: 'sync' });

        expect(success).toBe(true);
        expect(requestedUrl().searchParams.get('type')).toBe('sync');
        expect(writeSpy).toHaveBeenCalledWith('/project/github/syncs/list-repos.ts', 'sync code', 'utf-8');
    });

    it('reports ambiguity without writing', async () => {
        mockResponse(409, { error: { code: 'ambiguous_function', message: "Multiple functions named 'list-repos'" } });
        const writeSpy = mockFsForWriting();

        const success = await pull(baseOptions);

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/Re-run with --sync, --action, or --on-event/);
    });

    it('reports server errors without writing', async () => {
        mockResponse(404, { error: { code: 'unknown_function', message: 'Function not found' } });
        const writeSpy = mockFsForWriting();

        const success = await pull(baseOptions);

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/Function not found.*unknown_function/);
    });

    it('rejects unsafe names before calling the server', async () => {
        const success = await pull({ ...baseOptions, name: '../list-repos' });

        expect(success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('pullFromCatalog', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fetchMock.mockReset();
    });

    it('explains that the server is too old when it does not have the endpoint', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY_DEV: 'secret-dev' });
        mockResponse(404, '<!doctype html><pre>Cannot GET</pre>');
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/doesn't support pulling from the catalog/);
    });

    it('tries NANGO_SECRET_KEY first', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY_DEV: 'secret-dev', NANGO_SECRET_KEY: 'secret-default' });
        mockResponse(200, { type: 'action', code: 'action code' });
        mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        expect(requestedSecretKeys()).toEqual(['Bearer secret-default']);
    });

    it('moves on to the next secret key when one is rejected', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY: 'secret-revoked', NANGO_SECRET_KEY_DEV: 'secret-dev' });
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'unknown_error' } }), { status: 401 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'action', code: 'action code' }), { status: 200 }));
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        expect(requestedSecretKeys()).toEqual(['Bearer secret-revoked', 'Bearer secret-dev']);
        expect(writeSpy).toHaveBeenCalledWith('/project/github/actions/list-repos.ts', 'action code', 'utf-8');
    });

    it('moves on to the next secret key when one is not allowed to read the catalog', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY: 'secret-account-level', NANGO_SECRET_KEY_DEV: 'secret-dev' });
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'forbidden' } }), { status: 403 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'action', code: 'action code' }), { status: 200 }));
        mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        expect(requestedSecretKeys()).toEqual(['Bearer secret-account-level', 'Bearer secret-dev']);
    });

    it('does not try other secret keys when the error is not about the key', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY: 'secret-default', NANGO_SECRET_KEY_DEV: 'secret-dev' });
        mockResponse(404, { error: { code: 'unknown_function', message: 'Function not found' } });

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(requestedSecretKeys()).toEqual(['Bearer secret-default']);
    });

    it('reports that no secret key is valid when every key is rejected', async () => {
        stubSecretKeys({ NANGO_SECRET_KEY: 'secret-revoked', NANGO_SECRET_KEY_DEV: 'secret-also-revoked' });
        fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'unknown_error' } }), { status: 401 })));
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/No valid Nango secret key found/);
    });

    it('reports that no secret key is valid when none is set', async () => {
        stubSecretKeys({});

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/No valid Nango secret key found/);
    });
});

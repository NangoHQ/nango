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
        vi.stubEnv('NANGO_SECRET_KEY_DEV', 'secret-dev');
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
        expect(writeSpy).toHaveBeenCalledWith('/project/github/actions/list-repos.ts', 'action code', 'utf-8');
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
    beforeEach(() => {
        vi.stubEnv('NANGO_SECRET_KEY_DEV', 'secret-dev');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fetchMock.mockReset();
    });

    it('reports the catalog as unavailable when the server does not have the endpoint', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        mockResponse(404, '<!doctype html><pre>Cannot GET</pre>');
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(loggedMessages(consoleSpy)).toMatch(/not available on this Nango instance.*catalog_unavailable/);
    });
});

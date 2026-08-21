import fs from 'node:fs';

import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneTemplate } from './clone.service.js';

const RAW_BASE = 'https://raw.githubusercontent.com/NangoHQ/integration-templates/main/integrations';
const API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';

function buildNotFoundError(url: string): AxiosError {
    return new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: { url } as any,
        data: ''
    });
}

/**
 * @param files          raw file path -> content (raw.githubusercontent.com)
 * @param dirs           directory path -> Contents API listing (array responses)
 * @param symlinks       integration folder -> symlink target
 */
function mockGitHub(files: Record<string, string>, dirs: Record<string, any[]> = {}, symlinks: Record<string, string> = {}) {
    vi.spyOn(axios, 'get').mockImplementation((url: string) => {
        if (url.startsWith(`${API_BASE}/`)) {
            const apiPath = url.slice(`${API_BASE}/`.length);
            if (Object.prototype.hasOwnProperty.call(symlinks, apiPath)) {
                return Promise.resolve({
                    data: { name: apiPath, path: `integrations/${apiPath}`, type: 'symlink', target: symlinks[apiPath] }
                } as any);
            }
            if (Object.prototype.hasOwnProperty.call(dirs, apiPath)) {
                return Promise.resolve({ data: dirs[apiPath] } as any);
            }
            return Promise.reject(buildNotFoundError(url));
        }
        const relative = url.replace(`${RAW_BASE}/`, '');
        if (Object.prototype.hasOwnProperty.call(files, relative)) {
            return Promise.resolve({ data: files[relative] } as any);
        }
        return Promise.reject(buildNotFoundError(url));
    });
}

function mockFsForWriting() {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue('');
    return writeSpy;
}

const baseOptions = {
    fullPath: '/project',
    debug: false,
    force: false,
    autoConfirm: true,
    interactive: false
};

describe('cloneTemplate', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('clones a single function from a real integration', async () => {
        mockGitHub({ 'github/actions/list-repos.ts': 'export default async function () {}' }, { github: [] });
        const writeSpy = mockFsForWriting();

        const success = await cloneTemplate({ ...baseOptions, templatePath: 'github/actions/list-repos' });

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/github/actions/list-repos.ts');
    });

    it('fetches a symlinked function from its target but writes under the requested name', async () => {
        mockGitHub({ 'quickbooks/syncs/customers.ts': 'export default async function () {}' }, {}, { 'quickbooks-sandbox': 'quickbooks' });
        const writeSpy = mockFsForWriting();
        const axiosSpy = vi.spyOn(axios, 'get');

        const success = await cloneTemplate({ ...baseOptions, templatePath: 'quickbooks-sandbox/syncs/customers' });

        expect(success).toBe(true);
        expect(axiosSpy.mock.calls.map((call) => call[0])).toContain(`${RAW_BASE}/quickbooks/syncs/customers.ts`);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/syncs/customers.ts');
    });

    it('writes the companion .md of a symlinked function, fetching it from the target folder', async () => {
        mockGitHub(
            {
                'quickbooks/syncs/customers.ts': 'export default async function () {}',
                'quickbooks/syncs/customers.md': '# Customers'
            },
            {},
            { 'quickbooks-sandbox': 'quickbooks' }
        );
        const writeSpy = mockFsForWriting();
        const axiosSpy = vi.spyOn(axios, 'get');

        const success = await cloneTemplate({ ...baseOptions, templatePath: 'quickbooks-sandbox/syncs/customers' });

        expect(success).toBe(true);
        // The .md is not cached during dependency collection, so it must be fetched from the target folder...
        expect(axiosSpy.mock.calls.map((call) => call[0])).toContain(`${RAW_BASE}/quickbooks/syncs/customers.md`);
        // ...and written under the requested name.
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/syncs/customers.md');
    });

    it('reuses the listing from resolution and fetches the integration root only once', async () => {
        mockGitHub(
            { 'github/actions/list-repos.ts': 'export default async function () {}' },
            {
                github: [{ name: 'actions', path: 'integrations/github/actions', type: 'dir' }],
                'github/actions': [{ name: 'list-repos.ts', path: 'integrations/github/actions/list-repos.ts', type: 'file' }]
            }
        );
        const axiosSpy = vi.spyOn(axios, 'get');
        mockFsForWriting();

        const success = await cloneTemplate({ ...baseOptions, templatePath: 'github' });

        expect(success).toBe(true);
        // The integration root is fetched once (during resolution), not again by the directory probe or recursive walk.
        const rootFetches = axiosSpy.mock.calls.map((call) => call[0]).filter((url) => url === `${API_BASE}/github`);
        expect(rootFetches).toHaveLength(1);
    });

    it('clones a whole symlinked integration directory under the requested name', async () => {
        mockGitHub(
            { 'quickbooks/syncs/customers.ts': 'export default async function () {}' },
            {
                quickbooks: [{ name: 'syncs', path: 'integrations/quickbooks/syncs', type: 'dir' }],
                'quickbooks/syncs': [{ name: 'customers.ts', path: 'integrations/quickbooks/syncs/customers.ts', type: 'file' }]
            },
            { 'quickbooks-sandbox': 'quickbooks' }
        );
        const writeSpy = mockFsForWriting();

        const success = await cloneTemplate({ ...baseOptions, templatePath: 'quickbooks-sandbox' });

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/syncs/customers.ts');
    });
});

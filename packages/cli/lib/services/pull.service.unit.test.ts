import fs from 'node:fs';

import axios, { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pullFromCatalog } from './pull.service.js';

const RAW_BASE = 'https://raw.githubusercontent.com/NangoHQ/integration-templates/main/integrations';
const API_BASE = 'https://api.github.com/repos/NangoHQ/integration-templates/contents/integrations';

function buildNotFoundError(url: string): AxiosError {
    const err = new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: { url } as any,
        data: ''
    });
    return err;
}

// `symlinks` maps an integration folder to its target (mirrors the GitHub Contents API symlink response).
function mockGitHub(files: Record<string, string>, symlinks: Record<string, string> = {}) {
    vi.spyOn(axios, 'get').mockImplementation((url: string) => {
        if (url.startsWith(`${API_BASE}/`)) {
            const integration = url.slice(`${API_BASE}/`.length);
            if (Object.prototype.hasOwnProperty.call(symlinks, integration)) {
                return Promise.resolve({
                    data: { name: integration, path: `integrations/${integration}`, type: 'symlink', target: symlinks[integration] }
                } as any);
            }
            // A real directory: resolveIntegrationFolder only checks Array.isArray, contents are irrelevant.
            return Promise.resolve({ data: [] } as any);
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
    environmentName: 'catalog',
    integrationId: 'github',
    name: 'list-repos',
    debug: false,
    force: false,
    autoConfirm: true,
    interactive: false
};

describe('pullFromCatalog', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes the function file when a single match exists', async () => {
        mockGitHub({
            'github/actions/list-repos.ts': 'export default async function () {}'
        });
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/github/actions/list-repos.ts');
    });

    it('returns false and reports ambiguity when 2+ folders contain the name', async () => {
        mockGitHub({
            'github/syncs/list-repos.ts': 'sync code',
            'github/actions/list-repos.ts': 'action code'
        });
        const writeSpy = mockFsForWriting();
        const consoleSpy = vi.spyOn(console, 'log');

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        // No source files written when ambiguous
        const sourceWrites = writeSpy.mock.calls.filter((call) => (call[0] as string).endsWith('.ts'));
        expect(sourceWrites).toHaveLength(0);
        const messages = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(messages).toMatch(/Multiple functions named 'list-repos'/);
        expect(messages).toMatch(/sync, action/);
    });

    it('succeeds when 2+ folders have a match but --type narrows to one', async () => {
        mockGitHub({
            'github/syncs/list-repos.ts': 'sync code',
            'github/actions/list-repos.ts': 'action code'
        });
        const writeSpy = mockFsForWriting();
        const axiosSpy = vi.spyOn(axios, 'get');

        const success = await pullFromCatalog({ ...baseOptions, type: 'action' });

        expect(success).toBe(true);
        // Only the actions folder should be probed
        const probedPaths = axiosSpy.mock.calls.map((call) => call[0]).filter((u) => u.includes('list-repos.ts'));
        expect(probedPaths).toEqual([`${RAW_BASE}/github/actions/list-repos.ts`]);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/github/actions/list-repos.ts');
        expect(writtenPaths).not.toContain('/project/github/syncs/list-repos.ts');
    });

    it('returns false with a not-found message when no match exists', async () => {
        mockGitHub({});
        const writeSpy = mockFsForWriting();
        const consoleSpy = vi.spyOn(console, 'log');

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        const messages = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
        expect(messages).toMatch(/not found in catalog/);
    });

    it('writes the companion .md file when present', async () => {
        mockGitHub({
            'github/actions/list-repos.ts': 'export default async function () {}',
            'github/actions/list-repos.md': '# list-repos'
        });
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/github/actions/list-repos.ts');
        expect(writtenPaths).toContain('/project/github/actions/list-repos.md');
    });

    it.each([
        ['..', 'list-repos'],
        ['github', '..'],
        ['.', 'list-repos'],
        ['github', '.'],
        ['foo/bar', 'list-repos'],
        ['github', 'foo\\bar']
    ])('rejects path-traversal segments (%s, %s) without writing files', async (integrationId, name) => {
        const writeSpy = mockFsForWriting();
        const axiosSpy = vi.spyOn(axios, 'get');

        const success = await pullFromCatalog({ ...baseOptions, integrationId, name });

        expect(success).toBe(false);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(axiosSpy).not.toHaveBeenCalled();
    });

    it('walks transitive dependencies imported via relative paths', async () => {
        mockGitHub({
            'github/actions/list-repos.ts': "import { toRepo } from '../mappers/toRepo.js';\nexport default async () => toRepo();",
            'github/mappers/toRepo.ts': 'export const toRepo = () => ({});'
        });
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog(baseOptions);

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/github/actions/list-repos.ts');
        expect(writtenPaths).toContain('/project/github/mappers/toRepo.ts');
    });

    it('fetches from the symlink target but writes under the requested integration name', async () => {
        mockGitHub({ 'quickbooks/syncs/customers.ts': 'export default async function () {}' }, { 'quickbooks-sandbox': 'quickbooks' });
        const writeSpy = mockFsForWriting();
        const axiosSpy = vi.spyOn(axios, 'get');

        const success = await pullFromCatalog({ ...baseOptions, integrationId: 'quickbooks-sandbox', name: 'customers', type: 'sync' });

        expect(success).toBe(true);
        // Content is fetched from the resolved target folder...
        expect(axiosSpy.mock.calls.map((call) => call[0])).toContain(`${RAW_BASE}/quickbooks/syncs/customers.ts`);
        // ...but written under the requested (symlink) name so deploy maps it to the right providerConfigKey.
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/syncs/customers.ts');
    });

    it('localizes symlinked dependency paths too', async () => {
        mockGitHub(
            {
                'quickbooks/syncs/customers.ts': "import { toCustomer } from '../mappers/toCustomer.js';\nexport default async () => toCustomer();",
                'quickbooks/mappers/toCustomer.ts': 'export const toCustomer = () => ({});'
            },
            { 'quickbooks-sandbox': 'quickbooks' }
        );
        const writeSpy = mockFsForWriting();

        const success = await pullFromCatalog({ ...baseOptions, integrationId: 'quickbooks-sandbox', name: 'customers', type: 'sync' });

        expect(success).toBe(true);
        const writtenPaths = writeSpy.mock.calls.map((call) => call[0] as string);
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/syncs/customers.ts');
        expect(writtenPaths).toContain('/project/quickbooks-sandbox/mappers/toCustomer.ts');
    });
});

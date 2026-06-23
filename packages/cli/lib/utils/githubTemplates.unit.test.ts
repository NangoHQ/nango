import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubNotFoundError, localizeIntegrationPath, resolveIntegrationFolder } from './githubTemplates.js';

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

describe('resolveIntegrationFolder', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the same name for a real directory (array response)', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({ data: [{ name: 'syncs', path: 'integrations/github/syncs', type: 'dir' }] } as any);

        await expect(resolveIntegrationFolder('github', false)).resolves.toBe('github');
    });

    it('follows a symlink to its target sibling', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: { name: 'quickbooks-sandbox', path: 'integrations/quickbooks-sandbox', type: 'symlink', target: 'quickbooks' }
        } as any);

        await expect(resolveIntegrationFolder('quickbooks-sandbox', false)).resolves.toBe('quickbooks');
    });

    it('throws GitHubNotFoundError when the integration does not exist', async () => {
        vi.spyOn(axios, 'get').mockRejectedValue(buildNotFoundError(`${API_BASE}/nope`));

        await expect(resolveIntegrationFolder('nope', false)).rejects.toBeInstanceOf(GitHubNotFoundError);
    });
});

describe('localizeIntegrationPath', () => {
    it('rewrites the leading segment when folders differ', () => {
        expect(localizeIntegrationPath('quickbooks/syncs/customers.ts', 'quickbooks', 'quickbooks-sandbox')).toBe('quickbooks-sandbox/syncs/customers.ts');
    });

    it('is a no-op when remote and local folders match', () => {
        expect(localizeIntegrationPath('github/syncs/list-repos.ts', 'github', 'github')).toBe('github/syncs/list-repos.ts');
    });

    it('leaves paths outside the remote folder untouched', () => {
        expect(localizeIntegrationPath('other/syncs/x.ts', 'quickbooks', 'quickbooks-sandbox')).toBe('other/syncs/x.ts');
    });
});

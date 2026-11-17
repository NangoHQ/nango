import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { getCatalogEntry } from '../catalog/actions.js';
import { resolveTool } from './tools.js';

import type { getSyncConfigRaw } from '../sync/config/config.service.js';
import type { CurrentFunctionConfig, search } from './models/functions.js';
import type { DBSyncConfig } from '@nangohq/types';

const { searchFunctions, getAction, hasCatalogTools } = vi.hoisted(() => ({
    searchFunctions: vi.fn<typeof search>(),
    getAction: vi.fn<typeof getSyncConfigRaw>(),
    hasCatalogTools: vi.fn<() => Promise<boolean>>()
}));

vi.mock('./models/functions.js', () => ({ search: searchFunctions }));
vi.mock('../sync/config/config.service.js', () => ({ getSyncConfigRaw: getAction }));
vi.mock('@nangohq/feature-flags', () => ({ getFlags: () => ({ hasCatalogTools }) }));

const args = {
    accountUuid: '11111111-1111-4111-8111-111111111111',
    environmentId: 2,
    integration: { id: 9, unique_key: 'custom-github', provider: 'github' },
    name: 'create-issue'
};

const fn = {
    config: { uuid: '22222222-2222-4222-8222-222222222222', name: args.name, enabled: true },
    currentVersion: { source: 'repo', input_schema_ref: '#/definitions/Input' }
} as CurrentFunctionConfig;

const action = { sync_name: args.name, enabled: true, source: 'repo' } as DBSyncConfig;

beforeEach(() => {
    vi.clearAllMocks();
    searchFunctions.mockResolvedValue(Ok([]));
    getAction.mockResolvedValue(null);
    hasCatalogTools.mockResolvedValue(false);
});

describe('resolveTool', () => {
    it('prefers a deployed function', async () => {
        searchFunctions.mockResolvedValue(Ok([fn]));
        getAction.mockResolvedValue(action);

        expect((await resolveTool(args)).unwrap()).toEqual({
            kind: 'function',
            uuid: fn.config.uuid,
            source: 'repo',
            inputSchemaRef: '#/definitions/Input'
        });
        expect(getAction).not.toHaveBeenCalled();
    });

    it('blocks fallback for a disabled function', async () => {
        searchFunctions.mockResolvedValue(Ok([{ ...fn, config: { ...fn.config, enabled: false } }]));
        hasCatalogTools.mockResolvedValue(true);
        getAction.mockResolvedValue(action);

        expect((await resolveTool(args)).unwrap()).toEqual({ kind: 'missing', source: 'repo' });
        expect(getAction).not.toHaveBeenCalled();
    });

    it('prefers a deployed action', async () => {
        getAction.mockResolvedValue(action);
        hasCatalogTools.mockResolvedValue(true);

        expect((await resolveTool(args)).unwrap()).toEqual({ kind: 'deployed', config: action });
    });

    it.each([false, true])('preserves disabled action behavior: %s', async (catalogEnabled) => {
        getAction.mockResolvedValue({ ...action, enabled: false });
        hasCatalogTools.mockResolvedValue(catalogEnabled);

        const result = (await resolveTool(args)).unwrap();

        if (catalogEnabled) {
            expect(result).toEqual({ kind: 'deployed', config: action });
        } else {
            expect(result).toEqual({ kind: 'missing', source: 'repo' });
        }
    });

    it.each([false, true])('preserves catalog action availability: %s', async (catalogEnabled) => {
        hasCatalogTools.mockResolvedValue(catalogEnabled);

        const result = (await resolveTool(args)).unwrap();

        if (catalogEnabled) {
            expect(result).toEqual({ kind: 'catalog', tool: getCatalogEntry('github', args.name) });
        } else {
            expect(result).toEqual({ kind: 'missing' });
        }
    });

    it('returns missing', async () => {
        expect((await resolveTool({ ...args, name: 'unknown-function' })).unwrap()).toEqual({ kind: 'missing' });
    });

    it('returns a function lookup error', async () => {
        const error = new Error('lookup failed');
        searchFunctions.mockResolvedValue(Err(error));

        const result = await resolveTool(args);

        if (result.isOk()) throw new Error('Expected a lookup error');
        expect(result.error).toBe(error);
        expect(getAction).not.toHaveBeenCalled();
    });

    it('returns an action lookup error', async () => {
        const cause = new Error('lookup failed');
        getAction.mockRejectedValue(cause);

        const result = await resolveTool(args);

        if (result.isOk()) throw new Error('Expected a lookup error');
        expect(result.error).toMatchObject({ message: 'failed_to_resolve_tool', cause });
    });

    // TODO: Re-enable once a real function entry is committed to flows.zero.json.
    it.skip('resolves a catalog function', async () => {
        const definition = getCatalogEntry('github', 'get_issue');
        if (definition?.module !== 'function') throw new Error('Missing catalog fixture');

        expect((await resolveTool({ ...args, name: definition.name })).unwrap()).toEqual({
            kind: 'function',
            uuid: definition.uuid,
            source: 'catalog',
            inputSchemaRef: definition.input_schema_ref
        });
    });
});

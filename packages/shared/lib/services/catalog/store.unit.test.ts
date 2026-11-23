import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isTool } from '../functions/models/functions.js';
import { CatalogStore } from './store.js';

import type { CatalogIndex, FlowZeroJson } from '@nangohq/types';

const onEventScripts = {
    'post-connection-creation': [],
    'pre-connection-deletion': [],
    'validate-connection': []
} as unknown as FlowZeroJson['onEventScripts'];

// The same catalog as integration-templates writes it, in both formats.
function entry(providerConfigKey: string, actions: string[], syncs: string[], functions?: FlowZeroJson['functions']): FlowZeroJson {
    return {
        providerConfigKey,
        actions: actions.map((name) => ({ name, type: 'action' })) as unknown as FlowZeroJson['actions'],
        syncs: syncs.map((name) => ({ name, type: 'sync' })) as unknown as FlowZeroJson['syncs'],
        onEventScripts,
        ...(functions ? { functions } : {}),
        sdkVersion: '0.72.6'
    };
}

const github = entry('github', ['create-issue', 'close-issue'], ['issues']);
// A tool, and a function that isn't one (it subscribes to webhooks)
const linear = entry('linear', ['create-issue'], [], [
    { name: 'search-issues', type: 'tool', trigger: { kind: 'http' } },
    { name: 'issue-updated', type: 'function', trigger: { kind: 'http', subscriptions: ['issue.updated'] } }
] as unknown as FlowZeroJson['functions']);
const notion = entry('notion', [], ['pages', 'databases']);

function writeCatalog(dir: string, { withIndex = true, formatVersion = 1 }: { withIndex?: boolean; formatVersion?: number } = {}): void {
    const alias: FlowZeroJson = { ...github, providerConfigKey: 'github-app', symLinkTargetName: 'github' };
    const legacy = [{ ...github, symLinkTargetName: null }, alias, { ...linear, symLinkTargetName: null }, { ...notion, symLinkTargetName: null }];
    fs.writeFileSync(path.join(dir, 'flows.zero.json'), JSON.stringify(legacy));
    if (!withIndex) {
        return;
    }

    fs.mkdirSync(path.join(dir, 'catalog'));
    const providers: CatalogIndex['providers'] = {};
    for (const provider of [github, linear, notion]) {
        const text = JSON.stringify(provider);
        fs.writeFileSync(path.join(dir, 'catalog', `${provider.providerConfigKey}.json`), text);
        providers[provider.providerConfigKey] = {
            file: `catalog/${provider.providerConfigKey}.json`,
            sha256: createHash('sha256').update(text).digest('hex'),
            counts: {
                actions: provider.actions.length,
                syncs: provider.syncs.length,
                functions: provider.functions?.length ?? 0,
                tools: provider.functions?.filter(isTool).length ?? 0
            }
        };
    }
    providers['github-app'] = { aliasOf: 'github' };
    fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({ formatVersion, providers }));
}

describe('CatalogStore', () => {
    let dir: string;
    let useIndexFile: boolean;
    const store = (limits: { maxProviders?: number; maxBytes?: number } = {}) =>
        new CatalogStore({ dir, maxProviders: limits.maxProviders ?? 200, maxBytes: limits.maxBytes ?? 60 * 1024 * 1024, useIndexFile: () => useIndexFile });

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-store-'));
        useIndexFile = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('with catalog.json', () => {
        it('returns a provider entry from its file', () => {
            writeCatalog(dir);
            expect(store().getEntry('github')).toStrictEqual(github);
            expect(store().getEntry('unknown')).toBeNull();
        });

        it('returns an alias under its own key, with its target templates', () => {
            writeCatalog(dir);
            expect(store().getEntry('github-app')).toStrictEqual({ ...github, providerConfigKey: 'github-app', symLinkTargetName: 'github' });
        });

        it('lists providers, counts and symlink targets from the index alone', () => {
            writeCatalog(dir);
            const readFile = vi.spyOn(fs, 'readFileSync');
            const catalog = store();

            expect(catalog.listProviders()).toStrictEqual(['github', 'linear', 'notion', 'github-app']);
            expect(catalog.getCounts('github-app')).toStrictEqual({ actions: 2, syncs: 1, functions: 0, tools: 0 });
            expect(catalog.getCounts('linear')).toStrictEqual({ actions: 1, syncs: 0, functions: 2, tools: 1 });
            expect(catalog.getCounts('unknown')).toBeNull();
            expect(catalog.listProvidersWithFunctions()).toStrictEqual(['linear']);
            expect(catalog.getSymLinkTargetName('github-app')).toBe('github');
            expect(catalog.getSymLinkTargetName('github')).toBeNull();
            expect(readFile.mock.calls.map(([file]) => path.basename(String(file)))).toStrictEqual(['catalog.json']);
        });

        it('reads a provider file once while it stays cached', () => {
            writeCatalog(dir);
            const catalog = store();
            const readFile = vi.spyOn(fs, 'readFileSync');

            const first = catalog.getEntry('linear');
            expect(catalog.getEntry('linear')).toBe(first);
            expect(readFile.mock.calls.filter(([file]) => String(file).endsWith('linear.json'))).toHaveLength(1);
        });

        it('evicts the least recently used provider past the provider limit', () => {
            writeCatalog(dir);
            const catalog = store({ maxProviders: 2 });
            const readFile = vi.spyOn(fs, 'readFileSync');
            const reads = (file: string) => readFile.mock.calls.filter(([read]) => String(read).endsWith(file)).length;

            catalog.getEntry('github');
            catalog.getEntry('linear');
            catalog.getEntry('github'); // github is now the most recently used
            catalog.getEntry('notion'); // evicts linear

            catalog.getEntry('github');
            expect(reads('github.json')).toBe(1);
            catalog.getEntry('linear');
            expect(reads('linear.json')).toBe(2);
        });

        it('evicts by total file size, but always keeps the provider just read', () => {
            writeCatalog(dir);
            const catalog = store({ maxBytes: 1 });
            const readFile = vi.spyOn(fs, 'readFileSync');

            expect(catalog.getEntry('github')).toStrictEqual(github);
            expect(catalog.getEntry('github')).toStrictEqual(github);
            catalog.getEntry('linear');
            catalog.getEntry('github');
            expect(readFile.mock.calls.filter(([file]) => String(file).endsWith('github.json'))).toHaveLength(2);
        });
    });

    describe('reading flows.zero.json instead', () => {
        it('when the flag is off', () => {
            writeCatalog(dir);
            useIndexFile = false;
            const readFile = vi.spyOn(fs, 'readFileSync');
            const catalog = store();

            expect(catalog.getEntry('github')).toStrictEqual({ ...github, symLinkTargetName: null });
            expect(catalog.getEntry('github-app')).toMatchObject({ providerConfigKey: 'github-app', symLinkTargetName: 'github' });
            expect(catalog.getCounts('notion')).toStrictEqual({ actions: 0, syncs: 2, functions: 0, tools: 0 });
            expect(catalog.getCounts('linear')).toStrictEqual({ actions: 1, syncs: 0, functions: 2, tools: 1 });
            expect(catalog.listProvidersWithFunctions()).toStrictEqual(['linear']);
            expect(catalog.getSymLinkTargetName('github-app')).toBe('github');
            expect(catalog.listProviders()).toStrictEqual(['github', 'github-app', 'linear', 'notion']);
            expect(readFile.mock.calls.map(([file]) => path.basename(String(file)))).toStrictEqual(['flows.zero.json']);
        });

        it('when catalog.json is missing', () => {
            writeCatalog(dir, { withIndex: false });
            expect(store().getEntry('linear')).toStrictEqual({ ...linear, symLinkTargetName: null });
        });

        it('when catalog.json has another format version', () => {
            writeCatalog(dir, { formatVersion: 2 });
            expect(store().getEntry('linear')).toStrictEqual({ ...linear, symLinkTargetName: null });
        });

        it("when catalog.json isn't valid JSON", () => {
            writeCatalog(dir);
            fs.writeFileSync(path.join(dir, 'catalog.json'), '{"formatVersion": 1, "providers": {');
            expect(store().listProviders()).toStrictEqual(['github', 'github-app', 'linear', 'notion']);
        });

        it.each([
            ['has no providers', (index: CatalogIndex) => ({ formatVersion: index.formatVersion })],
            ['has no format version', (index: CatalogIndex) => ({ providers: index.providers })],
            ['lists a provider without its file', (index: CatalogIndex) => ({ ...index, providers: { ...index.providers, linear: { sha256: 'abc' } } })],
            [
                'lists an alias of a provider without a file',
                (index: CatalogIndex) => ({ ...index, providers: { ...index.providers, broken: { aliasOf: 'missing' } } })
            ]
        ])('when catalog.json %s', (_, edit) => {
            writeCatalog(dir);
            const indexPath = path.join(dir, 'catalog.json');
            fs.writeFileSync(indexPath, JSON.stringify(edit(JSON.parse(fs.readFileSync(indexPath, 'utf8')) as CatalogIndex)));

            const catalog = store();
            expect(catalog.getEntry('linear')).toStrictEqual({ ...linear, symLinkTargetName: null });
            expect(catalog.listProviders()).toStrictEqual(['github', 'github-app', 'linear', 'notion']);
        });
    });

    it('follows the flag when it changes while running', () => {
        writeCatalog(dir);
        const catalog = store();

        useIndexFile = false;
        expect(catalog.getEntry('linear')).toHaveProperty('symLinkTargetName', null);
        useIndexFile = true;
        expect(catalog.getEntry('linear')).toStrictEqual(linear);
        useIndexFile = false;
        expect(catalog.getEntry('linear')).toHaveProperty('symLinkTargetName', null);
    });
});

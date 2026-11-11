import { describe, expect, it, vi } from 'vitest';

import { CatalogReader } from './reader.js';

import type { CatalogFunctionManifestEntry, FlowZeroJson, FunctionTriggerDefinition, ParsedNangoAction, RequiredScopes } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const jsonSchema: JSONSchema7 = {
    definitions: {
        Input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        Output: { type: 'object', properties: { title: { type: 'string' } } },
        Metadata: { type: 'object', properties: { cursor: { type: 'string' } } },
        Checkpoint: { type: 'object', properties: { page: { type: 'number' } } }
    }
};

function nativeFunction(overrides: Partial<CatalogFunctionManifestEntry> = {}): CatalogFunctionManifestEntry {
    return {
        module: 'function',
        name: 'fetch_issue',
        description: 'Fetch an issue',
        trigger: { kind: 'http' },
        requires: { connection: true, outbound: true },
        capabilities: { usesRecords: false, usesOutbound: true, usesCheckpoints: true, usesMetadata: true, usesInvoke: false },
        limits: { concurrency: { perConnection: 1 } },
        tags: { instructions: 'Use this to fetch a known issue.', required_scopes: { any: ['repo', 'public_repo'] }, category: 'issues' },
        input_schema_ref: '#/definitions/Input',
        output_schema_ref: '#/definitions/Output',
        model_schema_refs: [],
        metadata_schema_ref: '#/definitions/Metadata',
        checkpoint_schema_ref: '#/definitions/Checkpoint',
        json_schema: jsonSchema,
        version: 'a1b2c3d4e5f6',
        sdkVersion: '0.72.4',
        fileLocation: 'build/github_functions_read-issue.cjs',
        sourceLocation: 'tools/read-issue.ts',
        ...overrides
    };
}

function action(overrides: Partial<ParsedNangoAction> = {}): ParsedNangoAction {
    return {
        name: 'create-issue',
        type: 'action',
        description: 'Create an issue',
        input: 'Input',
        output: ['Output'],
        endpoint: null,
        scopes: ['repo'],
        usedModels: ['Input', 'Output'],
        version: '1.0.0',
        features: ['checkpoints'],
        json_schema: jsonSchema,
        ...overrides
    };
}

function integration(overrides: Partial<FlowZeroJson> = {}): FlowZeroJson {
    return {
        providerConfigKey: 'github',
        actions: [action()],
        syncs: [],
        onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [], 'validate-connection': [] },
        sdkVersion: '0.72.4',
        ...overrides
    };
}

function readerFor(entry: FlowZeroJson): CatalogReader {
    return new CatalogReader(() => [entry]);
}

const triggers: FunctionTriggerDefinition[] = [
    { kind: 'http' },
    { kind: 'http', subscriptions: ['issue.updated'], debounce: { keyBy: { body: '$.id' }, windowMs: 1000 } },
    { kind: 'schedule', frequency: 'every hour', autoStart: false },
    { kind: 'event', events: ['post-connection-creation'] },
    { kind: 'none' }
];

const scopeDeclarations: (RequiredScopes | undefined)[] = [{ all: ['repo', 'read:user'] }, { any: ['repo', 'public_repo'] }, { none: true }, undefined];

describe('CatalogReader', () => {
    it('reads legacy manifests without native function entries', () => {
        const reader = readerFor(integration());
        const entry = reader.getEntry('github', 'create-issue');

        expect(reader.listEntries('github')).toEqual([
            {
                name: 'create-issue',
                description: 'Create an issue',
                module: 'action',
                input: 'Input',
                output: ['Output'],
                scopes: ['repo'],
                jsonSchema,
                version: '1.0.0',
                sdkVersion: '0.72.4-zero',
                fileLocation: 'templates-zero/github/build/github_actions_create-issue.cjs',
                sourceLocation: 'templates-zero/github/actions/create-issue.ts',
                capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: true, usesMetadata: false, usesInvoke: false }
            }
        ]);
        expect(reader.listActions('github')).toEqual([entry]);
        expect(reader.getAction('github', 'create-issue')).toBe(entry);
    });

    it('reads mixed manifests and preserves native function metadata and explicit artifact paths', () => {
        const definition = nativeFunction();
        const manifest = integration({ functions: [definition] });
        const original = structuredClone(manifest);
        const reader = readerFor(manifest);

        expect(reader.listEntries('github').map((entry) => entry.module)).toEqual(['action', 'function']);
        expect(reader.getEntry('github', 'fetch_issue')).toEqual({
            ...definition,
            provider: 'github',
            fileLocation: 'templates-zero/github/build/github_functions_read-issue.cjs',
            sourceLocation: 'templates-zero/github/tools/read-issue.ts'
        });
        expect(reader.getEntry('github', 'read-issue')).toBeUndefined();
        expect(manifest).toEqual(original);
    });

    it.each(triggers)('preserves native trigger $kind without restricting the catalog to tools', (trigger) => {
        const definition = nativeFunction({ trigger });
        const reader = readerFor(integration({ functions: [definition] }));
        const entry = reader.getEntry('github', definition.name);

        expect(entry?.module).toBe('function');
        if (entry?.module !== 'function') {
            throw new Error('Expected a native function');
        }
        expect(entry.trigger).toEqual(trigger);
    });

    it('preserves connectionless requirements, record models, and capabilities', () => {
        const definition = nativeFunction({
            trigger: { kind: 'none' },
            requires: { connection: false, invoke: true },
            capabilities: { usesRecords: true, usesOutbound: false, usesCheckpoints: false, usesMetadata: true, usesInvoke: true },
            model_schema_refs: ['#/definitions/Output'],
            limits: { concurrency: { perConnection: 'max' } }
        });
        const entry = readerFor(integration({ functions: [definition] })).getEntry('github', definition.name);

        expect(entry).toEqual({
            ...definition,
            provider: 'github',
            fileLocation: 'templates-zero/github/build/github_functions_read-issue.cjs',
            sourceLocation: 'templates-zero/github/tools/read-issue.ts'
        });
    });

    it.each(scopeDeclarations)('preserves structured provider scopes: %j', (requiredScopes) => {
        const definition = nativeFunction({ tags: requiredScopes ? { required_scopes: requiredScopes } : {} });
        const entry = readerFor(integration({ functions: [definition] })).getEntry('github', definition.name);

        expect(entry).toMatchObject({ tags: definition.tags });
        expect(entry).not.toHaveProperty('scopes');
    });

    it('keeps native functions out of action-only APIs', () => {
        const reader = readerFor(integration({ functions: [nativeFunction()] }));

        expect(reader.listActions('github').map((entry) => entry.name)).toEqual(['create-issue']);
        expect(reader.getAction('github', 'fetch_issue')).toBeUndefined();
    });

    it('supports providers containing only native functions', () => {
        const reader = readerFor(integration({ actions: [], functions: [nativeFunction()] }));

        expect(reader.listEntries('github')).toHaveLength(1);
        expect(reader.listActions('github')).toEqual([]);
    });

    it('resolves aliases to canonical artifact folders without deriving filenames from public names', () => {
        const reader = readerFor(integration({ providerConfigKey: 'github-alias', symLinkTargetName: 'github', functions: [nativeFunction()] }));

        expect(reader.getEntry('github-alias', 'fetch_issue')).toMatchObject({
            fileLocation: 'templates-zero/github/build/github_functions_read-issue.cjs',
            sourceLocation: 'templates-zero/github/tools/read-issue.ts'
        });
        expect(reader.getAction('github-alias', 'create-issue')?.fileLocation).toBe('templates-zero/github/build/github_actions_create-issue.cjs');
    });

    it.each([
        integration({ actions: [action(), action()] }),
        integration({ functions: [nativeFunction({ name: 'create-issue' })] }),
        integration({ functions: [nativeFunction(), nativeFunction()] })
    ])('rejects duplicate names across actions and native functions', (manifest) => {
        const reader = readerFor(manifest);

        expect(() => reader.listEntries('github')).toThrow(/Duplicate catalog function name '.+' for provider 'github'/);
        expect(() => reader.getEntry('github', 'create-issue')).toThrow(/Duplicate catalog function name/);
    });

    it('caches normalized entries and name lookups per provider', () => {
        const loadManifest = vi.fn(() => [integration({ functions: [nativeFunction()] })]);
        const reader = new CatalogReader(loadManifest);
        const entries = reader.listEntries('github');
        const actions = reader.listActions('github');

        expect(reader.listEntries('github')).toBe(entries);
        expect(reader.listActions('github')).toBe(actions);
        expect(reader.getEntry('github', 'fetch_issue')).toBe(entries[1]);
        expect(reader.getAction('github', 'create-issue')).toBe(actions[0]);
        expect(loadManifest).toHaveBeenCalledTimes(1);
    });

    it('caches empty results for unknown providers and returns undefined for unknown names', () => {
        const loadManifest = vi.fn(() => [integration()]);
        const reader = new CatalogReader(loadManifest);

        expect(reader.listEntries('unknown')).toEqual([]);
        expect(reader.listActions('unknown')).toEqual([]);
        expect(reader.getEntry('unknown', 'fetch_issue')).toBeUndefined();
        expect(reader.getAction('unknown', 'create-issue')).toBeUndefined();
        expect(loadManifest).toHaveBeenCalledTimes(1);
        expect(reader.getEntry('github', 'unknown')).toBeUndefined();
    });

    it('preserves legacy null schemas and missing outputs', () => {
        const reader = readerFor(integration({ actions: [action({ json_schema: undefined, input: null, output: null, features: undefined })] }));

        expect(reader.getAction('github', 'create-issue')).toMatchObject({
            input: null,
            output: [],
            jsonSchema: null,
            capabilities: { usesCheckpoints: false }
        });
    });

    it('preserves legacy fallback filtering of integration schemas', () => {
        const reader = readerFor(integration({ actions: [action({ json_schema: undefined })], jsonSchema }));

        expect(reader.getAction('github', 'create-issue')?.jsonSchema?.definitions).toEqual({
            Input: jsonSchema.definitions?.['Input'],
            Output: jsonSchema.definitions?.['Output']
        });
    });
});

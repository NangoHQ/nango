import { describe, expect, it } from 'vitest';

import { functionVersionHash } from './version.js';

import type { FunctionDeploymentArtifact } from '@nangohq/types';

const artifact = {
    name: 'github-issues',
    integrationId: 'github',
    description: 'Fetch issues',
    trigger: { kind: 'none' },
    requires: { connection: true, outbound: true, invoke: false },
    capabilities: { usesOutbound: true, usesRecords: false, usesMetadata: false, usesCheckpoints: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: null,
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: { type: 'object', properties: { issue: { type: 'string', description: 'Issue' } } },
    fileBody: { js: 'export default async function run() {}', ts: 'export default async function run(): Promise<void> {}' }
} satisfies FunctionDeploymentArtifact;

describe(functionVersionHash, () => {
    it('treats omitted and empty tags as the same version', () => {
        expect(functionVersionHash({ ...artifact, tags: {} }).unwrap()).toBe(functionVersionHash(artifact).unwrap());
        expect(functionVersionHash({ ...artifact, tags: undefined }).unwrap()).toBe(functionVersionHash(artifact).unwrap());
    });

    it('changes when tags are added, changed or removed', () => {
        const tagged = { ...artifact, tags: { category: 'crm', entities: ['contacts', 'companies'] } };
        const hash = functionVersionHash(tagged).unwrap();

        expect(hash).not.toBe(functionVersionHash(artifact).unwrap());
        expect(hash).not.toBe(functionVersionHash({ ...tagged, tags: { ...tagged.tags, category: 'sales' } }).unwrap());
        expect(hash).not.toBe(functionVersionHash({ ...tagged, tags: { ...tagged.tags, entities: ['contacts'] } }).unwrap());
        expect(hash).not.toBe(functionVersionHash({ ...tagged, tags: {} }).unwrap());
    });

    it('is stable across tag key order', () => {
        expect(functionVersionHash({ ...artifact, tags: { category: 'crm', entities: ['contacts', 'companies'] } }).unwrap()).toBe(
            functionVersionHash({ ...artifact, tags: { entities: ['contacts', 'companies'], category: 'crm' } }).unwrap()
        );
    });

    it('is stable across object key order', () => {
        const reordered = {
            ...artifact,
            json_schema: { properties: { issue: { description: 'Issue', type: 'string' } }, type: 'object' }
        } satisfies FunctionDeploymentArtifact;

        expect(functionVersionHash(reordered).unwrap()).toBe(functionVersionHash(artifact).unwrap());
    });

    it('changes when the compiled js changes', () => {
        expect(functionVersionHash({ ...artifact, fileBody: { ...artifact.fileBody, js: `${artifact.fileBody.js}\n// changed` } }).unwrap()).not.toBe(
            functionVersionHash(artifact).unwrap()
        );
    });

    it('changes when the typeScript source changes', () => {
        expect(functionVersionHash({ ...artifact, fileBody: { ...artifact.fileBody, ts: `${artifact.fileBody.ts}\n// changed` } }).unwrap()).not.toBe(
            functionVersionHash(artifact).unwrap()
        );
    });

    it('changes when the trigger changes', () => {
        expect(functionVersionHash({ ...artifact, trigger: { kind: 'http' } }).unwrap()).not.toBe(functionVersionHash(artifact).unwrap());
    });
});

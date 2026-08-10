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
});

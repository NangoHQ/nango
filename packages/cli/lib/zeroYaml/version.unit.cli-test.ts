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
    fileBody: { js: 'export default async function run() {}', ts: 'export default async function run(): Promise<void> {}' },
    source: 'repo'
} satisfies FunctionDeploymentArtifact;

describe(functionVersionHash, () => {
    it('matches the server hash', () => {
        expect(functionVersionHash(artifact)).toBe('41e0e2d3d7be65eb90b53b0f6eabbda23b88392c15552302f2df811b825215d6');
        expect(functionVersionHash({ ...artifact, tags: {} })).toBe('41e0e2d3d7be65eb90b53b0f6eabbda23b88392c15552302f2df811b825215d6');
    });
});

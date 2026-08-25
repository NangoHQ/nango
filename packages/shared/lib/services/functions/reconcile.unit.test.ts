import { describe, expect, it } from 'vitest';

import { reconcile } from './reconcile.js';
import { functionVersionHash } from './version.js';

import type { CurrentFunctionConfig } from './models/functions.js';
import type { FunctionDeploymentArtifact } from '@nangohq/types';

const artifact = {
    name: 'fetchIssues',
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
    json_schema: { type: 'object' },
    fileBody: { js: 'export default async function run() {}', ts: 'export default async function run(): Promise<void> {}' }
} satisfies FunctionDeploymentArtifact;

function deployedFunction({
    id,
    nangoConfigId,
    artifact,
    version
}: {
    id: number;
    nangoConfigId: number;
    artifact: FunctionDeploymentArtifact;
    version?: string;
}) {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const versionId = id * 10;
    return {
        integration: { id: nangoConfigId, unique_key: artifact.integrationId, provider: 'github' },
        config: {
            id,
            nango_config_id: nangoConfigId,
            environment_id: 1,
            name: artifact.name,
            current_version_id: versionId,
            enabled: true,
            created_at: now,
            updated_at: now,
            deleted_at: null
        },
        currentVersion: {
            id: versionId,
            function_config_id: id,
            description: artifact.description,
            file_location: `functions/${versionId}`,
            version: version ?? functionVersionHash(artifact).unwrap(),
            source: 'repo',
            trigger: artifact.trigger,
            requires: artifact.requires,
            capabilities: artifact.capabilities,
            limits: artifact.limits,
            input_schema_ref: artifact.input_schema_ref,
            output_schema_ref: artifact.output_schema_ref,
            model_schema_refs: artifact.model_schema_refs,
            metadata_schema_ref: artifact.metadata_schema_ref,
            checkpoint_schema_ref: artifact.checkpoint_schema_ref,
            json_schema: artifact.json_schema,
            created_at: now,
            updated_at: now,
            deleted_at: null
        }
    } satisfies CurrentFunctionConfig;
}

describe(reconcile, () => {
    it('classifies a complete bundle', () => {
        const updatedArtifact = {
            ...artifact,
            name: 'updated',
            fileBody: {
                ...artifact.fileBody,
                js: `${artifact.fileBody.js}// changed`
            }
        };
        const createdArtifact = { ...artifact, name: 'created' };
        const deletedArtifact = { ...artifact, name: 'deleted' };
        const deployed = [
            deployedFunction({ id: 1, nangoConfigId: 10, artifact }),
            deployedFunction({ id: 2, nangoConfigId: 10, artifact: updatedArtifact, version: 'previous-hash' }),
            deployedFunction({ id: 3, nangoConfigId: 10, artifact: deletedArtifact })
        ];

        const result = reconcile({
            functions: [artifact, updatedArtifact, createdArtifact],
            deployed
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expect(result.value.created.map(({ name }) => name)).toStrictEqual([createdArtifact.name]);
        expect(result.value.updated.map(({ name }) => name)).toStrictEqual([updatedArtifact.name]);
        expect(result.value.unchanged.map(({ name }) => name)).toStrictEqual([artifact.name]);
        expect(result.value.deleted.map(({ config }) => config.name)).toStrictEqual([deletedArtifact.name]);
    });

    it('deletes every deployed function when bundle is empty', () => {
        const deployed = [
            deployedFunction({ id: 1, nangoConfigId: 10, artifact }),
            deployedFunction({ id: 2, nangoConfigId: 20, artifact: { ...artifact, name: 'another' } })
        ];
        const result = reconcile({ functions: [], deployed });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) return;
        expect(result.value).toMatchObject({ created: [], updated: [], unchanged: [], deleted: deployed });
    });

    it('rejects duplicate functions', () => {
        const result = reconcile({
            functions: [artifact, artifact],
            deployed: []
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.message).toBe('duplicate_function_in_bundle');
    });
});

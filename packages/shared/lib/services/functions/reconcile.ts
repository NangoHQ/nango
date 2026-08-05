import { Err, Ok } from '@nangohq/utils';

import { functionVersionHash } from './version.js';

import type { CurrentFunctionConfig } from './models/functions.js';
import type { FunctionDeploymentArtifact } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Reconcile the incoming function deployment artifacts with the currently deployed functions.
 *
 * @param functions - The incoming function deployment artifacts.
 * @param deployed - The currently deployed functions.
 * @returns A result containing the created, updated, unchanged, and deleted functions.
 * A function is considered created if it is present in the incoming artifacts but not currently deployed.
 * A function is considered updated if it is currently deployed and present in the incoming artifacts, but its version hash does not match the currently deployed version hash.
 * A function is considered unchanged if its version hash matches the currently deployed version hash.
 * A function is considered deleted if it is currently deployed but not present in the incoming artifacts.
 */
export function reconcile({ functions, deployed }: { functions: FunctionDeploymentArtifact[]; deployed: CurrentFunctionConfig[] }): Result<{
    created: FunctionDeploymentArtifact[];
    updated: FunctionDeploymentArtifact[];
    unchanged: FunctionDeploymentArtifact[];
    deleted: CurrentFunctionConfig[];
}> {
    try {
        const deployedByIdentity = new Map(
            deployed.map((current) => [functionIdentity({ integrationId: current.integration.unique_key, name: current.config.name }), current])
        );
        const incomingIdentities = new Set<string>();
        const created: FunctionDeploymentArtifact[] = [];
        const updated: FunctionDeploymentArtifact[] = [];
        const unchanged: FunctionDeploymentArtifact[] = [];

        for (const artifact of functions) {
            const identity = functionIdentity(artifact);
            if (incomingIdentities.has(identity)) {
                return Err(new Error('duplicate_function_in_bundle', { cause: { integrationId: artifact.integrationId, name: artifact.name } }));
            }
            incomingIdentities.add(identity);

            const current = deployedByIdentity.get(identity);
            const version = functionVersionHash(artifact);
            if (version.isErr()) {
                return Err(version.error);
            }
            if (!current) {
                created.push(artifact);
            } else if (current.currentVersion.version === version.value) {
                unchanged.push(artifact);
            } else {
                updated.push(artifact);
            }
        }

        const deleted = deployed.filter(
            (current) => !incomingIdentities.has(functionIdentity({ integrationId: current.integration.unique_key, name: current.config.name }))
        );
        return Ok({ created, updated, unchanged, deleted });
    } catch (err) {
        return Err(new Error('failed_to_reconcile_functions', { cause: err }));
    }
}

function functionIdentity({ integrationId, name }: Pick<FunctionDeploymentArtifact, 'integrationId' | 'name'>): string {
    return JSON.stringify([integrationId, name]);
}

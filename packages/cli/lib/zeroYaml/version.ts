import { createHash } from 'node:crypto';

import safeStringify from 'fast-safe-stringify';

import type { FunctionDeploymentArtifact } from '@nangohq/types';

// Keep in sync with packages/shared/lib/services/functions/version.ts.
// Note: depends on `--sourcemap` and `source`.
export function functionVersionHash(artifact: FunctionDeploymentArtifact): string {
    const { tags, ...config } = artifact;
    const serialized = safeStringify.default.stableStringify(tags && Object.keys(tags).length > 0 ? { ...config, tags } : config);
    return createHash('sha256').update(serialized).digest('hex');
}

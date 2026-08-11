import { createHash } from 'node:crypto';

import { Err, Ok, stringifyStable } from '@nangohq/utils';

import type { FunctionDeploymentArtifact } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export function functionVersionHash(artifact: FunctionDeploymentArtifact): Result<string> {
    const serialized = stringifyStable(artifact);
    if (serialized.isErr()) {
        return Err(new Error('failed_to_hash_function_version', { cause: serialized.error }));
    }

    try {
        return Ok(createHash('sha256').update(serialized.value).digest('hex'));
    } catch (err) {
        return Err(new Error('failed_to_hash_function_version', { cause: err }));
    }
}

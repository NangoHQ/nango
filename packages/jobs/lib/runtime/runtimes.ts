import { LambdaRuntimeAdapter } from '@nangohq/runtimes';
import { Ok } from '@nangohq/utils';

import { RunnerRuntimeAdapter } from '../runner/adapter.js';

import type { RuntimeAdapter } from '@nangohq/runtimes';
import type { NangoProps } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const adapters: RuntimeAdapter[] = [new LambdaRuntimeAdapter()];

const defaultAdapter = new RunnerRuntimeAdapter();

export async function getRuntimeAdapter(_nangoProps: NangoProps): Promise<Result<RuntimeAdapter>> {
    for (const adapter of adapters) {
        if (adapter.canHandle(_nangoProps)) {
            return Promise.resolve(Ok(adapter));
        }
    }
    return Promise.resolve(Ok(defaultAdapter));
}

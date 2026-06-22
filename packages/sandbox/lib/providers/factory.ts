import { isLocal } from '@nangohq/utils';

import { envs } from '../env.js';
import { AgentCoreSandboxProvider } from './agentcore.js';
import { DockerSandboxProvider } from './docker.js';
import { E2BSandboxProvider } from './e2b.js';

import type { SandboxProvider, SandboxProviderName } from './types.js';

export function resolveDefaultSandboxProviderName(): SandboxProviderName {
    if (envs.SANDBOX_PROVIDER) {
        return envs.SANDBOX_PROVIDER;
    }

    return isLocal ? 'docker' : 'e2b';
}

export function createSandboxProvider(provider: SandboxProviderName = resolveDefaultSandboxProviderName()): SandboxProvider {
    switch (provider) {
        case 'agentcore':
            return new AgentCoreSandboxProvider();
        case 'docker':
            return new DockerSandboxProvider();
        case 'e2b':
            return new E2BSandboxProvider();
    }
}

import { isLocal } from '@nangohq/utils';

import { envs } from '../env.js';
import { AgentCoreSandboxProvider } from './agentcore.js';
import { DockerSandboxProvider } from './docker.js';

import type { SandboxProvider, SandboxProviderName } from './types.js';

export function resolveDefaultSandboxProviderName(): SandboxProviderName {
    if (envs.SANDBOX_PROVIDER) {
        return envs.SANDBOX_PROVIDER;
    }

    return isLocal ? 'docker' : 'agentcore';
}

export function createSandboxProvider(provider: SandboxProviderName = resolveDefaultSandboxProviderName()): SandboxProvider {
    switch (provider) {
        case 'agentcore':
            return new AgentCoreSandboxProvider();
        case 'docker':
            return new DockerSandboxProvider();
    }
}

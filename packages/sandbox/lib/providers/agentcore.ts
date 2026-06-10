import { SandboxNotImplementedError } from './errors.js';

import type { CreateSandboxParams, Sandbox, SandboxProvider } from './types.js';

export class AgentCoreSandboxProvider implements SandboxProvider {
    public readonly name = 'agentcore';

    create(_params: CreateSandboxParams): Promise<Sandbox> {
        throw new SandboxNotImplementedError('Amazon Bedrock AgentCore sandbox provider is not implemented yet');
    }

    cleanup(_sandboxId: string): Promise<void> {
        throw new SandboxNotImplementedError('Amazon Bedrock AgentCore sandbox provider is not implemented yet');
    }
}

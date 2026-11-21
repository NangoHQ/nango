import type { ApiAgentGettingStarted } from '@nangohq/types';

export type StepState = 'upcoming' | 'current' | 'done';

export interface AgentProgress {
    install: StepState;
    tryIntegrations: StepState;
    hasConnection: boolean;
    hasToolCall: boolean;
}

export function deriveAgentProgress({ progress, promptCopied }: { progress: ApiAgentGettingStarted; promptCopied: boolean }): AgentProgress {
    const hasConnection = progress.first_agent_connection_at !== null;
    const hasToolCall = progress.first_tool_call_at !== null;
    const isInstalled = promptCopied || hasConnection || hasToolCall;
    const isTried = hasConnection && hasToolCall;

    return {
        install: isInstalled ? 'done' : 'current',
        tryIntegrations: !isInstalled ? 'upcoming' : isTried ? 'done' : 'current',
        hasConnection,
        hasToolCall
    };
}

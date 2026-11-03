import type { ApiAgentGettingStarted } from '@nangohq/types';

export type StepState = 'upcoming' | 'current' | 'done';

export interface AgentProgress {
    install: StepState;
    tryIntegrations: StepState;
    hasConnection: boolean;
    hasToolCall: boolean;
    hasProgress: boolean;
}

/**
 * Copying the prompt only lasts for this page view. Install stays done after a refresh once the agent
 * shows real progress: a connection or a tool call.
 */
export function deriveAgentProgress({ progress, promptCopied }: { progress: ApiAgentGettingStarted; promptCopied: boolean }): AgentProgress {
    const hasConnection = progress.first_agent_connection_at !== null;
    const hasToolCall = progress.first_tool_call_at !== null;
    const isInstalled = promptCopied || hasConnection || hasToolCall;
    const isTried = hasConnection && hasToolCall;

    return {
        install: isInstalled ? 'done' : 'current',
        tryIntegrations: !isInstalled ? 'upcoming' : isTried ? 'done' : 'current',
        hasConnection,
        hasToolCall,
        hasProgress: isInstalled
    };
}

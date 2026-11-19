import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';
import type { AgentPlaygroundIntegrationSetup, AgentPlaygroundSetUpToolName, AgentPlaygroundSetUpToolOutput } from '@nangohq/types';

type ToolPart = Extract<PlaygroundMessage['parts'][number], { type: 'dynamic-tool' }>;

export const SET_UP_INTEGRATIONS_TOOL: AgentPlaygroundSetUpToolName = 'set_up_integrations';

export function isSetUpPart(part: ToolPart): boolean {
    return part.toolName === SET_UP_INTEGRATIONS_TOOL;
}

export function setUpResults(part: ToolPart): AgentPlaygroundIntegrationSetup[] {
    return part.state === 'output-available' ? ((part.output as AgentPlaygroundSetUpToolOutput | undefined)?.setups ?? []) : [];
}

export function setUpApps(part: ToolPart): string[] {
    const apps = (part.input as { apps?: unknown } | undefined)?.apps;
    return Array.isArray(apps) ? apps.filter((app): app is string => typeof app === 'string') : [];
}

export function isAdded(setup: AgentPlaygroundIntegrationSetup): boolean {
    return setup.outcome === 'created' || setup.outcome === 'existing';
}

export function createdIntegrationIds(messages: PlaygroundMessage[]): string[] {
    return messages.flatMap((message) =>
        message.parts.flatMap((part) =>
            part.type === 'dynamic-tool' && isSetUpPart(part)
                ? setUpResults(part).flatMap((setup) => (setup.outcome === 'created' && setup.integrationId ? [setup.integrationId] : []))
                : []
        )
    );
}

function messageSetups(message: PlaygroundMessage): AgentPlaygroundIntegrationSetup[] {
    const starter = message.metadata?.integrationSetup;
    return [...(starter ? [starter] : []), ...message.parts.flatMap((part) => (part.type === 'dynamic-tool' && isSetUpPart(part) ? setUpResults(part) : []))];
}

export function setupsSinceLastSession(messages: PlaygroundMessage[], index: number): AgentPlaygroundIntegrationSetup[] {
    const setups: AgentPlaygroundIntegrationSetup[] = [];
    for (let i = index; i >= 0; i--) {
        const message = messages[i];
        if (!message || (i < index && message.metadata?.sessionCreated)) {
            break;
        }
        setups.unshift(...messageSetups(message));
    }
    return setups;
}

export function lastSetUpPartIndex(message: PlaygroundMessage): number {
    for (let i = message.parts.length - 1; i >= 0; i--) {
        const part = message.parts[i];
        if (part?.type === 'dynamic-tool' && isSetUpPart(part) && setUpResults(part).length > 0) {
            return i;
        }
    }
    return -1;
}

export function providersToAdd(message: PlaygroundMessage | undefined): string[] {
    if (message?.role !== 'assistant') {
        return [];
    }
    const setups = messageSetups(message);
    return [...new Set(setups.filter((setup) => !isAdded(setup)).map((setup) => setup.provider))];
}

// A new integration's tools only reach the agent with the next request. An app the user still has to add waits for them.
export function continuesAfterSetUp({ messages }: { messages: PlaygroundMessage[] }): boolean {
    const last = messages.at(-1);
    const part = last?.role === 'assistant' ? last.parts.filter((candidate) => candidate.type !== 'step-start').at(-1) : undefined;
    if (part?.type !== 'dynamic-tool' || !isSetUpPart(part)) {
        return false;
    }
    const setups = setUpResults(part);
    return setups.some((setup) => setup.outcome === 'created') && setups.every(isAdded);
}

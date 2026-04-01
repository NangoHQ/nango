import type { OpencodeClient } from '@opencode-ai/sdk/v2';

export const agentProjectPath = '/home/user/nango-integrations';

export const AGENT_MODEL = { providerID: 'opencode', modelID: 'kimi-k2.5', full: 'opencode/kimi-k2.5' } as const;

export interface AgentSessionPayload {
    prompt: string;
    integration_id: string;
    connection_id?: string;
}

export interface AgentSessionResolvedPayload extends AgentSessionPayload {
    nango_base_url: string;
}

export function resolvePayload(payload: AgentSessionPayload): AgentSessionResolvedPayload {
    const serverUrl = process.env['NANGO_SERVER_URL'];
    return {
        ...payload,
        nango_base_url: serverUrl ?? 'https://api.nango.dev'
    };
}

export interface AgentRuntimeHandle {
    client: OpencodeClient;
    baseUrl: string;
    accessToken: string | undefined;
    sandboxId: string;
    serverPid: number;
    resolvedPayload: AgentSessionResolvedPayload;
    /** E2B: extend sandbox lifetime. Omitted for local Docker. */
    refreshTimeout?: (timeoutMs: number) => Promise<void>;
    destroy(): Promise<void>;
}

export function createRuntimeConfig(): Record<string, unknown> {
    const apiKey = process.env['OPENCODE_API_KEY'];
    return {
        model: AGENT_MODEL.full,
        small_model: AGENT_MODEL.full,
        enabled_providers: [AGENT_MODEL.providerID],
        permission: {
            '*': 'allow',
            external_directory: { '/**': 'allow' }
        },
        ...(apiKey ? { provider: { [AGENT_MODEL.providerID]: { options: { apiKey } } } } : {})
    };
}

export function createAgentPrompt(payload: AgentSessionResolvedPayload): string {
    const { prompt, integration_id, connection_id, nango_base_url } = payload;
    const context: Record<string, unknown> = { integration_id, nango_base_url };
    if (connection_id) {
        context['connection_id'] = connection_id;
    }
    return `${prompt}\n\nYou are working inside a prepared Nango project at ${agentProjectPath}. Use the installed skill named nango-remote-function-builder from .agents/skills when relevant.\n\nContext:\n${JSON.stringify(context, null, 2)}`;
}

export function createAnswerPrompt(answer: string): string {
    return `User response: ${answer}\n\nContinue from the current session state.`;
}

export function createSessionTitle(payload: AgentSessionResolvedPayload): string {
    return `Build ${payload.integration_id}`;
}

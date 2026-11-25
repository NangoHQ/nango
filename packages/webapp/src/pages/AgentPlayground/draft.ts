import { PROVIDER_STARTER_PROMPTS } from './starterPrompts';

export interface PlaygroundDraft {
    text: string;
    env: string;
    starterProvider?: string;
}

interface PlaygroundDraftState {
    playgroundDraft: PlaygroundDraft;
}

export function playgroundDraftState(text: string, env: string, starterProvider?: string): PlaygroundDraftState {
    return { playgroundDraft: { text, env, ...(starterProvider ? { starterProvider } : {}) } };
}

export function readPlaygroundDraft(state: unknown): PlaygroundDraft | undefined {
    if (!state || typeof state !== 'object' || !('playgroundDraft' in state)) {
        return undefined;
    }
    const draft = state.playgroundDraft;
    if (draft && typeof draft === 'object' && 'text' in draft && 'env' in draft && typeof draft.text === 'string' && typeof draft.env === 'string') {
        const starterProvider = 'starterProvider' in draft && typeof draft.starterProvider === 'string' ? draft.starterProvider : undefined;
        return { text: draft.text, env: draft.env, ...(starterProvider ? { starterProvider } : {}) };
    }
    return undefined;
}

export function hasStarterPrompt(provider: string): boolean {
    return Object.prototype.hasOwnProperty.call(PROVIDER_STARTER_PROMPTS, provider);
}

export function integrationPrompt({ provider, integrationName }: { provider: string; integrationName: string }): string {
    return PROVIDER_STARTER_PROMPTS[provider] ?? `Show me what you can do with my ${integrationName} account`;
}

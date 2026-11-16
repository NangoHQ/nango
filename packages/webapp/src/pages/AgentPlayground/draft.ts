import { PROVIDER_STARTER_PROMPTS } from './starterPrompts';

interface PlaygroundDraftState {
    playgroundDraft: string;
}

export function playgroundDraftState(draft: string): PlaygroundDraftState {
    return { playgroundDraft: draft };
}

export function readPlaygroundDraft(state: unknown): string | undefined {
    if (state && typeof state === 'object' && 'playgroundDraft' in state && typeof state.playgroundDraft === 'string') {
        return state.playgroundDraft;
    }
    return undefined;
}

export function integrationPrompt({ provider, integrationName }: { provider: string; integrationName: string }): string {
    return PROVIDER_STARTER_PROMPTS[provider] ?? `Show me what you can do with my ${integrationName} account`;
}

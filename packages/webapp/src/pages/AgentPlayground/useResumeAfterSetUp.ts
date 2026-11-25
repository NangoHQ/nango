import { useEffect, useRef } from 'react';

import { providersToAdd } from './setUpTool';

import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';

export function useResumeAfterSetUp({
    messages,
    integrationsLoaded,
    integrationsUpdatedAt,
    addedIntegrations,
    canSend,
    providerName,
    sendMessage
}: {
    messages: PlaygroundMessage[];
    integrationsLoaded: boolean;
    integrationsUpdatedAt: number;
    addedIntegrations: Map<string, string>;
    canSend: boolean;
    providerName: (provider: string) => string;
    sendMessage: (message: { text: string; metadata: { hidden: true } }) => Promise<void>;
}): void {
    const awaitingSetUp = useRef<{ messageId: string; since: number; resumed: boolean } | undefined>(undefined);
    useEffect(() => {
        const last = messages.at(-1);
        const providers = providersToAdd(last);
        if (!last || providers.length === 0 || !canSend) {
            return;
        }
        if (awaitingSetUp.current?.messageId !== last.id) {
            awaitingSetUp.current = { messageId: last.id, since: Date.now(), resumed: false };
        }
        // A list fetched before the setup reply can still hold an integration that was deleted since.
        if (!integrationsLoaded || integrationsUpdatedAt <= awaitingSetUp.current.since || awaitingSetUp.current.resumed) {
            return;
        }
        if (providers.every((provider) => addedIntegrations.has(provider))) {
            awaitingSetUp.current.resumed = true;
            const names = providers.map(providerName).join(' and ');
            void sendMessage({
                text: `I've added the ${names} integration, so it no longer needs setting up. Carry on with my request.`,
                metadata: { hidden: true }
            });
        }
    }, [messages, integrationsLoaded, integrationsUpdatedAt, addedIntegrations, canSend, providerName, sendMessage]);
}

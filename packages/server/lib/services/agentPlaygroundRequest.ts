import { generateText, Output } from 'ai';
import * as z from 'zod/v4';

import { getProviders } from '@nangohq/shared';
import { getLogger, stringifyError } from '@nangohq/utils';

import { ModelKeyMissingError } from './agentPlaygroundModelError.js';

import type { LanguageModel } from 'ai';

const logger = getLogger('AgentPlayground');

const MAX_APPS = 10;
const TIMEOUT_MS = 15_000;

export interface PlaygroundRequest {
    intent: string;
    providers: string[];
    hasUnsupportedProvider: boolean;
}

const INSTRUCTIONS = `You label the first message a user sends to the Nango Agent Playground, where an AI agent acts on the user's apps, such as Gmail, GitHub or Slack. Do not answer the message.
- intent: what the user wants done, in a short phrase such as "summarize unread emails" or "create an issue from a Slack thread". Leave out names, emails, IDs and other personal details.
- apps: each product the message names, by its full name, such as "Microsoft Teams" rather than "Teams". Leave out generic words such as email or calendar. Empty when it names no product.`;

const labelSchema = z.object({
    intent: z.string().trim().min(1).max(255),
    apps: z.array(z.string().trim().min(1).max(100)).max(MAX_APPS)
});

function normalize(name: string): string {
    return name
        .replace(/\s*\([^)]*\)$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function providerIndex(): Map<string, string> {
    const providers = Object.entries(getProviders() ?? {});
    const byName = new Map<string, string>();
    // Keys first, so "GitHub" resolves to `github` rather than to whichever provider shares its display name.
    for (const [key] of providers) {
        byName.set(normalize(key), key);
    }
    for (const [key, provider] of providers) {
        const name = normalize(provider.display_name);
        if (!byName.has(name)) {
            byName.set(name, key);
        }
    }
    return byName;
}

export function resolveApps(apps: string[]): Pick<PlaygroundRequest, 'providers' | 'hasUnsupportedProvider'> {
    const index = providerIndex();
    const providers = new Set<string>();
    let hasUnsupportedProvider = false;
    for (const app of apps) {
        const provider = index.get(normalize(app));
        if (provider) {
            providers.add(provider);
        } else {
            hasUnsupportedProvider = true;
        }
    }
    return { providers: [...providers], hasUnsupportedProvider };
}

export async function labelFirstMessage(model: LanguageModel, message: string): Promise<PlaygroundRequest | undefined> {
    try {
        const { output } = await generateText({
            model,
            instructions: INSTRUCTIONS,
            prompt: message,
            output: Output.object({ schema: labelSchema }),
            providerOptions: { openai: { reasoningEffort: 'low' } },
            abortSignal: AbortSignal.timeout(TIMEOUT_MS)
        });
        return { intent: output.intent, ...resolveApps(output.apps) };
    } catch (err) {
        if (err instanceof ModelKeyMissingError) {
            return undefined;
        }
        logger.warning(`Agent Playground could not label a first message: ${stringifyError(err)}`);
        return undefined;
    }
}

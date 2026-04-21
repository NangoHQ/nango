import { OpenFeature } from '@openfeature/server-sdk';

import { NoopProvider } from './providers/noop.js';

import type { FlagContext } from './types.js';
import type { Client, EvaluationContext, Provider } from '@openfeature/server-sdk';

export interface FeatureFlagsClient {
    isEnabled(key: string, context: FlagContext, defaultValue: boolean): Promise<boolean>;
    destroy(): Promise<void>;
}

function toEvaluationContext(context: FlagContext): EvaluationContext {
    const out: EvaluationContext = {};
    for (const [key, value] of Object.entries(context)) {
        if (value === undefined) continue;
        out[key] = value;
    }
    return out;
}

const FLAG_DOMAIN = 'nango-feature-flags';

export function buildFeatureFlagsClient(provider: Provider): FeatureFlagsClient {
    OpenFeature.setProvider(FLAG_DOMAIN, provider);
    const ofClient: Client = OpenFeature.getClient(FLAG_DOMAIN);

    return {
        async isEnabled(key, context, defaultValue) {
            try {
                return await ofClient.getBooleanValue(key, defaultValue, toEvaluationContext(context));
            } catch {
                return defaultValue;
            }
        },
        async destroy() {
            // Swap to NOOP so OpenFeature unregisters the provider and invokes its onClose internally.
            await OpenFeature.setProviderAndWait(FLAG_DOMAIN, new NoopProvider());
        }
    };
}

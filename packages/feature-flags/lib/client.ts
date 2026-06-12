import { OpenFeature } from '@openfeature/server-sdk';

import { getLogger } from '@nangohq/utils';

import { NoopProvider } from './providers/noop.js';

import type { FlagContext } from './types.js';
import type { Client, EvaluationContext, JsonValue, Provider } from '@openfeature/server-sdk';

const logger = getLogger('FeatureFlags');

export interface FeatureFlagsClient {
    isEnabled(key: string, context: FlagContext, defaultValue: boolean): Promise<boolean>;
    // Non-boolean flags, served as Unleash variant payloads (provisioned by nango-flags).
    getString(key: string, context: FlagContext, defaultValue: string): Promise<string>;
    getNumber(key: string, context: FlagContext, defaultValue: number): Promise<number>;
    getObject<T extends JsonValue>(key: string, context: FlagContext, defaultValue: T): Promise<T>;
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

function fallbackOnEvaluationError<T>(key: string, defaultValue: T, err: unknown): T {
    logger.warning('Feature flag evaluation failed, using default', { key, err });
    return defaultValue;
}

const FLAG_DOMAIN = 'nango-feature-flags';

export function buildFeatureFlagsClient(provider: Provider): FeatureFlagsClient {
    OpenFeature.setProvider(FLAG_DOMAIN, provider);
    const ofClient: Client = OpenFeature.getClient(FLAG_DOMAIN);

    return {
        async isEnabled(key, context, defaultValue) {
            try {
                return await ofClient.getBooleanValue(key, defaultValue, toEvaluationContext(context));
            } catch (err) {
                return fallbackOnEvaluationError(key, defaultValue, err);
            }
        },
        async getString(key, context, defaultValue) {
            try {
                return await ofClient.getStringValue(key, defaultValue, toEvaluationContext(context));
            } catch (err) {
                return fallbackOnEvaluationError(key, defaultValue, err);
            }
        },
        async getNumber(key, context, defaultValue) {
            try {
                return await ofClient.getNumberValue(key, defaultValue, toEvaluationContext(context));
            } catch (err) {
                return fallbackOnEvaluationError(key, defaultValue, err);
            }
        },
        async getObject(key, context, defaultValue) {
            try {
                return (await ofClient.getObjectValue(key, defaultValue, toEvaluationContext(context))) as typeof defaultValue;
            } catch (err) {
                return fallbackOnEvaluationError(key, defaultValue, err);
            }
        },
        async destroy() {
            // Swap to NOOP so OpenFeature unregisters the provider and invokes its onClose internally.
            await OpenFeature.setProviderAndWait(FLAG_DOMAIN, new NoopProvider());
        }
    };
}

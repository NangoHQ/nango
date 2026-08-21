import { OpenFeature } from '@openfeature/server-sdk';

import { getLogger, metrics } from '@nangohq/utils';

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

type FlagValueType = 'boolean' | 'string' | 'number' | 'object';

const FLAG_DOMAIN = 'nango-feature-flags';

export function buildFeatureFlagsClient(provider: Provider): FeatureFlagsClient {
    OpenFeature.setProvider(FLAG_DOMAIN, provider);
    const ofClient: Client = OpenFeature.getClient(FLAG_DOMAIN);

    return {
        isEnabled(key, context, defaultValue) {
            return evaluateFlag(key, 'boolean', () => ofClient.getBooleanValue(key, defaultValue, toEvaluationContext(context)), defaultValue);
        },
        getString(key, context, defaultValue) {
            return evaluateFlag(key, 'string', () => ofClient.getStringValue(key, defaultValue, toEvaluationContext(context)), defaultValue);
        },
        getNumber(key, context, defaultValue) {
            return evaluateFlag(key, 'number', () => ofClient.getNumberValue(key, defaultValue, toEvaluationContext(context)), defaultValue);
        },
        getObject(key, context, defaultValue) {
            return evaluateFlag(
                key,
                'object',
                async () => (await ofClient.getObjectValue(key, defaultValue, toEvaluationContext(context))) as typeof defaultValue,
                defaultValue
            );
        },
        async destroy() {
            // Swap to NOOP so OpenFeature unregisters the provider and invokes its onClose internally.
            await OpenFeature.setProviderAndWait(FLAG_DOMAIN, new NoopProvider());
        }
    };
}

function toEvaluationContext(context: FlagContext): EvaluationContext {
    const out: EvaluationContext = {};
    for (const [key, value] of Object.entries(context)) {
        if (value === undefined) continue;
        out[key] = value;
    }
    return out;
}

async function evaluateFlag<T>(key: string, type: FlagValueType, evaluate: () => Promise<T>, defaultValue: T): Promise<T> {
    let value: T;
    let usedDefault = false;
    try {
        value = await evaluate();
    } catch (err) {
        logger.warning('Feature flag evaluation failed, using default', { key, err });
        value = defaultValue;
        usedDefault = true;
    }
    recordFlagEvaluated(key, type, value, usedDefault);
    return value;
}

function recordFlagEvaluated(key: string, type: FlagValueType, value: unknown, usedDefault = false): void {
    try {
        const dimensions: Record<string, string> = { flag: key, type };
        if (usedDefault) {
            dimensions['used_default'] = 'true';
        }
        // Only boolean results are tagged — two values per flag. String/number/object
        // payloads can be unbounded and would blow up Datadog cardinality.
        if (type === 'boolean') {
            dimensions['result'] = String(value);
        }
        metrics.increment(metrics.Types.FEATURE_FLAGS_EVALUATED, 1, dimensions);
    } catch {
        // Best-effort telemetry; must not affect flag evaluation.
    }
}

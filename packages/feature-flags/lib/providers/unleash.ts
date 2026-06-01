import { ErrorCode } from '@openfeature/server-sdk';
import { initialize } from 'unleash-client';

import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import type { Context as UnleashEvaluationContext, Unleash } from 'unleash-client';

const KNOWN_KEYS = new Set(['userId', 'sessionId', 'remoteAddress', 'environment', 'appName', 'currentTime']);

export interface UnleashProviderConfig {
    url: string;
    appName: string;
    apiToken?: string | undefined;
    refreshIntervalMs?: number | undefined;
}

function stringifyValue(value: unknown): string {
    switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
        case 'bigint':
            return value.toString();
        case 'object':
            return JSON.stringify(value);
        default:
            return '';
    }
}

function toUnleashContext(context: EvaluationContext): UnleashEvaluationContext {
    const out: UnleashEvaluationContext = {};
    const properties: Record<string, string> = {};

    for (const [key, value] of Object.entries(context)) {
        if (value === undefined || value === null) continue;
        const str = stringifyValue(value);
        if (key === 'targetingKey') {
            out.userId = str;
        } else if (KNOWN_KEYS.has(key)) {
            (out as unknown as Record<string, string>)[key] = str;
        } else {
            properties[key] = str;
        }
    }
    if (Object.keys(properties).length > 0) {
        out.properties = properties;
    }
    return out;
}

export class UnleashProvider implements Provider {
    readonly metadata = { name: 'unleash' };
    readonly runsOn = 'server' as const;

    private readonly unleash: Unleash;
    private ready = false;

    constructor(config: UnleashProviderConfig) {
        this.unleash = initialize({
            url: config.url,
            appName: config.appName,
            refreshInterval: config.refreshIntervalMs ?? 30_000,
            disableMetrics: false,
            customHeaders: config.apiToken ? { Authorization: config.apiToken } : {}
        });

        this.unleash.on('synchronized', () => {
            this.ready = true;
        });
        this.unleash.on('error', (err: Error) => {
            console.error(`Unleash error: ${err.message}`);
        });
    }

    async initialize(): Promise<void> {
        if (this.ready) return;
        await new Promise<void>((resolve) => {
            this.unleash.once('synchronized', () => resolve());
            this.unleash.once('error', () => resolve());
        });
    }

    onClose(): Promise<void> {
        this.unleash.destroy();
        return Promise.resolve();
    }

    resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<boolean>> {
        try {
            const value = this.unleash.isEnabled(flagKey, toUnleashContext(context), defaultValue);
            return Promise.resolve({ value, reason: 'TARGETING_MATCH' });
        } catch (err) {
            return Promise.resolve({
                value: defaultValue,
                reason: 'ERROR',
                errorCode: ErrorCode.GENERAL,
                errorMessage: err instanceof Error ? err.message : String(err)
            });
        }
    }

    // Non-boolean values are served as Unleash variant payloads (provisioned by the
    // nango-flags repo as strategy variants). getVariant returns the payload string.
    private payloadValue(flagKey: string, context: EvaluationContext): string | undefined {
        const variant = this.unleash.getVariant(flagKey, toUnleashContext(context));
        if (variant.feature_enabled && variant.payload?.value !== undefined) {
            return variant.payload.value;
        }
        return undefined;
    }

    resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<string>> {
        try {
            const raw = this.payloadValue(flagKey, context);
            if (raw === undefined) return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
            return Promise.resolve({ value: raw, reason: 'TARGETING_MATCH' });
        } catch (err) {
            return Promise.resolve(this.evaluationError(defaultValue, err));
        }
    }

    resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<number>> {
        try {
            const raw = this.payloadValue(flagKey, context);
            const num = raw === undefined ? NaN : Number(raw);
            if (Number.isNaN(num)) return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
            return Promise.resolve({ value: num, reason: 'TARGETING_MATCH' });
        } catch (err) {
            return Promise.resolve(this.evaluationError(defaultValue, err));
        }
    }

    resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<T>> {
        try {
            const raw = this.payloadValue(flagKey, context);
            if (raw === undefined) return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
            return Promise.resolve({ value: JSON.parse(raw) as T, reason: 'TARGETING_MATCH' });
        } catch (err) {
            return Promise.resolve(this.evaluationError(defaultValue, err));
        }
    }

    private evaluationError<T>(defaultValue: T, err: unknown): ResolutionDetails<T> {
        return {
            value: defaultValue,
            reason: 'ERROR',
            errorCode: ErrorCode.GENERAL,
            errorMessage: err instanceof Error ? err.message : String(err)
        };
    }
}

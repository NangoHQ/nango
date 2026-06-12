import { ErrorCode } from '@openfeature/server-sdk';
import { initialize } from 'unleash-client';

import { getLogger } from '@nangohq/utils';

import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';
import type { Context as UnleashEvaluationContext, Unleash } from 'unleash-client';

const logger = getLogger('FeatureFlags.Unleash');

const DEFAULT_INIT_TIMEOUT_MS = 10_000;

const KNOWN_KEYS = new Set(['userId', 'sessionId', 'remoteAddress', 'environment', 'appName', 'currentTime']);

export interface UnleashProviderConfig {
    url: string;
    appName: string;
    apiToken?: string | undefined;
    refreshIntervalMs?: number | undefined;
    initTimeoutMs?: number | undefined;
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
            if (value instanceof Date) {
                return value.toISOString();
            }
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
        if (key === 'currentTime') {
            out.currentTime = value instanceof Date ? value : new Date(stringifyValue(value));
            continue;
        }
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
    private readonly whenReady: Promise<void>;
    private settleWhenReady: (() => void) | undefined;
    private hasToggleData = false;
    private apiSynced = false;

    constructor(config: UnleashProviderConfig) {
        this.unleash = initialize({
            url: config.url,
            appName: config.appName,
            refreshInterval: config.refreshIntervalMs ?? 30_000,
            disableMetrics: false,
            customHeaders: config.apiToken ? { Authorization: config.apiToken } : {}
        });

        this.whenReady = this.waitForFirstContact(config.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS);

        this.unleash.on('ready', () => {
            this.hasToggleData = true;
        });
        this.unleash.on('synchronized', () => {
            if (!this.apiSynced) {
                logger.info('Unleash synchronized; flag evaluations now use remote toggles');
                this.apiSynced = true;
            }
            this.hasToggleData = true;
        });
        this.unleash.on('error', (err: Error) => {
            logger.error('Unleash error', err);
        });
    }

    hasSynchronized(): boolean {
        return this.hasToggleData;
    }

    private waitForFirstContact(timeoutMs: number): Promise<void> {
        if (this.unleash.isSynchronized()) {
            this.hasToggleData = true;
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let settled = false;
            const settle = (synchronized: boolean) => {
                if (settled) return;
                settled = true;
                this.settleWhenReady = undefined;
                clearTimeout(timer);
                this.unleash.removeListener('ready', onReady);
                this.unleash.removeListener('synchronized', onReady);
                if (synchronized) {
                    this.hasToggleData = true;
                }
                resolve();
            };

            this.settleWhenReady = () => settle(false);

            const onReady = () => settle(true);
            this.unleash.once('ready', onReady);
            this.unleash.once('synchronized', onReady);

            const timer = setTimeout(() => {
                logger.warning('Unleash first contact timed out; flag evaluations will use defaults until synchronized');
                settle(false);
            }, timeoutMs);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
        });
    }

    async initialize(): Promise<void> {
        await this.whenReady;
    }

    // unleash-client destroy() is synchronous — stops polling and clears timers.
    onClose(): Promise<void> {
        this.settleWhenReady?.();
        this.unleash.destroy();
        return Promise.resolve();
    }

    async resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<boolean>> {
        await this.whenReady;
        try {
            const value = this.unleash.isEnabled(flagKey, toUnleashContext(context), defaultValue);
            const reason = this.unleash.isSynchronized() ? 'TARGETING_MATCH' : 'DEFAULT';
            return { value, reason };
        } catch (err) {
            return this.evaluationError(defaultValue, err);
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

    async resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<string>> {
        await this.whenReady;
        try {
            const raw = this.payloadValue(flagKey, context);
            if (raw === undefined) return { value: defaultValue, reason: 'DEFAULT' };
            return { value: raw, reason: 'TARGETING_MATCH' };
        } catch (err) {
            return this.evaluationError(defaultValue, err);
        }
    }

    async resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<number>> {
        await this.whenReady;
        try {
            const raw = this.payloadValue(flagKey, context);
            const num = raw === undefined ? NaN : Number(raw);
            if (Number.isNaN(num)) return { value: defaultValue, reason: 'DEFAULT' };
            return { value: num, reason: 'TARGETING_MATCH' };
        } catch (err) {
            return this.evaluationError(defaultValue, err);
        }
    }

    async resolveObjectEvaluation<T extends JsonValue>(
        flagKey: string,
        defaultValue: T,
        context: EvaluationContext,
        _logger: Logger
    ): Promise<ResolutionDetails<T>> {
        await this.whenReady;
        try {
            const raw = this.payloadValue(flagKey, context);
            if (raw === undefined) return { value: defaultValue, reason: 'DEFAULT' };
            return { value: JSON.parse(raw) as T, reason: 'TARGETING_MATCH' };
        } catch (err) {
            return this.evaluationError(defaultValue, err);
        }
    }

    // Return the default with reason 'ERROR'; OpenFeature applies the default and exposes error metadata.
    // https://openfeature.dev/docs/reference/concepts/provider/
    private evaluationError<T>(defaultValue: T, err: unknown): ResolutionDetails<T> {
        return {
            value: defaultValue,
            reason: 'ERROR',
            errorCode: ErrorCode.GENERAL,
            errorMessage: err instanceof Error ? err.message : String(err)
        };
    }
}

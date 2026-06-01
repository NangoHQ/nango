import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';

export class NoopProvider implements Provider {
    readonly metadata = { name: 'noop' };
    readonly runsOn = 'server' as const;

    resolveBooleanEvaluation(_flagKey: string, defaultValue: boolean, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<boolean>> {
        return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
    }

    resolveStringEvaluation(_flagKey: string, defaultValue: string, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<string>> {
        return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
    }

    resolveNumberEvaluation(_flagKey: string, defaultValue: number, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<number>> {
        return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
    }

    resolveObjectEvaluation<T extends JsonValue>(
        _flagKey: string,
        defaultValue: T,
        _context: EvaluationContext,
        _logger: Logger
    ): Promise<ResolutionDetails<T>> {
        return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
    }
}

import { ErrorCode } from '@openfeature/server-sdk';

import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';

const FLAG_NOT_FOUND: ResolutionDetails<never> = {
    value: undefined as never,
    reason: 'ERROR',
    errorCode: ErrorCode.FLAG_NOT_FOUND
};

export class NoopProvider implements Provider {
    readonly metadata = { name: 'noop' };
    readonly runsOn = 'server' as const;

    resolveBooleanEvaluation(_flagKey: string, defaultValue: boolean, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<boolean>> {
        return Promise.resolve({ value: defaultValue, reason: 'DEFAULT' });
    }

    resolveStringEvaluation(_flagKey: string, _defaultValue: string, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<string>> {
        return Promise.resolve(FLAG_NOT_FOUND);
    }

    resolveNumberEvaluation(_flagKey: string, _defaultValue: number, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<number>> {
        return Promise.resolve(FLAG_NOT_FOUND);
    }

    resolveObjectEvaluation<T extends JsonValue>(
        _flagKey: string,
        _defaultValue: T,
        _context: EvaluationContext,
        _logger: Logger
    ): Promise<ResolutionDetails<T>> {
        return Promise.resolve(FLAG_NOT_FOUND);
    }
}

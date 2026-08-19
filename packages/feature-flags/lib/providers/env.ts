import { ErrorCode } from '@openfeature/server-sdk';

import { getLogger } from '@nangohq/utils';

import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails } from '@openfeature/server-sdk';

const logger = getLogger('FeatureFlags.Env');

/**
 * One env var per flag, named after the flag key uppercased with dashes as underscores:
 * `NANGO_FEATURE_FLAG_AUDIT_TRAIL=true` serves `true` for the `audit-trail` flag.
 */
const FLAG_PREFIX = 'NANGO_FEATURE_FLAG_';

/**
 * Serves flags from environment variables, for local development and self-hosted
 * deployments that have no flag service to point at. Flags with no variable set
 * resolve to the default the call site declares.
 *
 * Evaluation context is ignored: a variable applies to the whole process, so there is
 * no per-account targeting or gradual rollout. Use Unleash for those.
 */
export class EnvProvider implements Provider {
    readonly metadata = { name: 'env' };
    readonly runsOn = 'server' as const;

    private readonly flags = new Map<string, string>();

    constructor() {
        for (const [name, value] of Object.entries(process.env)) {
            if (value === undefined || !name.startsWith(FLAG_PREFIX) || name === FLAG_PREFIX) {
                continue;
            }
            this.flags.set(flagKey(name), value);
        }

        if (this.flags.size > 0) {
            logger.info(`Serving feature flags from env vars: ${[...this.flags.keys()].join(', ')}`);
        } else {
            logger.warning(`No ${FLAG_PREFIX}* variable is set; every flag will use its default`);
        }
    }

    resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<boolean>> {
        return Promise.resolve(
            this.resolve(flagKey, defaultValue, 'boolean', (raw) => {
                const normalized = raw.trim().toLowerCase();
                if (normalized === 'true') return true;
                if (normalized === 'false') return false;
                return undefined;
            })
        );
    }

    resolveStringEvaluation(flagKey: string, defaultValue: string, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<string>> {
        return Promise.resolve(this.resolve(flagKey, defaultValue, 'string', (raw) => raw));
    }

    resolveNumberEvaluation(flagKey: string, defaultValue: number, _context: EvaluationContext, _logger: Logger): Promise<ResolutionDetails<number>> {
        return Promise.resolve(
            this.resolve(flagKey, defaultValue, 'number', (raw) => {
                const trimmed = raw.trim();
                if (trimmed === '') return undefined;
                const parsed = Number(trimmed);
                return Number.isFinite(parsed) ? parsed : undefined;
            })
        );
    }

    resolveObjectEvaluation<T extends JsonValue>(
        flagKey: string,
        defaultValue: T,
        _context: EvaluationContext,
        _logger: Logger
    ): Promise<ResolutionDetails<T>> {
        return Promise.resolve(
            this.resolve(flagKey, defaultValue, 'object', (raw) => {
                let parsed: JsonValue;
                try {
                    parsed = JSON.parse(raw) as JsonValue;
                } catch {
                    return undefined;
                }
                // Parsing succeeding doesn't make the value the right shape: JSON also gives us
                // null, arrays and primitives, and handing one back as T lies to the caller.
                return jsonKind(parsed) === jsonKind(defaultValue) ? (parsed as T) : undefined;
            })
        );
    }

    private resolve<T>(flagKey: string, defaultValue: T, type: string, parse: (raw: string) => T | undefined): ResolutionDetails<T> {
        const raw = this.flags.get(flagKey);
        if (raw === undefined) {
            return { value: defaultValue, reason: 'DEFAULT' };
        }

        const value = parse(raw);
        if (value === undefined) {
            logger.warning('Ignoring feature flag value, it does not match the flag type', { flag: flagKey, type, value: raw });
            const envVar = `${FLAG_PREFIX}${flagKey.toUpperCase().replaceAll('-', '_')}`;
            return {
                value: defaultValue,
                reason: 'ERROR',
                errorCode: ErrorCode.TYPE_MISMATCH,
                errorMessage: `${envVar} is not a valid ${type}`
            };
        }

        return { value, reason: 'STATIC' };
    }
}

function jsonKind(value: JsonValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function flagKey(envVar: string): string {
    return envVar.slice(FLAG_PREFIX.length).toLowerCase().replaceAll('_', '-');
}

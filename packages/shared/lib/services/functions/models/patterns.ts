import { RE2JS } from 're2js';

import type { Options } from 'ajv';

type RegExpEngine = NonNullable<NonNullable<Options['code']>['regExp']>;
type RegExpLike = ReturnType<RegExpEngine>;

// Function input schemas come from whoever deploys the function, so their `pattern` and
// `patternProperties` keywords must never reach the backtracking RegExp engine.
// RE2 matches in O(program size * input length), and both factors are bounded below.
export const MAX_PATTERN_LENGTH = 2048;
export const MAX_PATTERN_PROGRAM_SIZE = 1000;
export const MAX_PATTERN_MATCH_COST = 1_000_000;
export const PATTERN_MATCH_TIME_BUDGET_MS = 100;

export class PatternBudgetExceededError extends Error {
    constructor() {
        super('pattern_budget_exceeded');
        this.name = 'pattern_budget_exceeded';
    }
}

let patternMatchTimeSpentMs = 0;

/**
 * Starts a fresh time budget shared by every pattern match until the next reset.
 * A match that would exceed it throws `PatternBudgetExceededError` instead of running.
 */
export function resetPatternBudget(): void {
    patternMatchTimeSpentMs = 0;
}

class BoundedPattern implements RegExpLike {
    private readonly key: string;

    constructor(
        source: string,
        flags: string,
        private readonly regexp: RE2JS
    ) {
        // ajv dedupes compiled patterns by `toString()` in a scope shared by every schema
        this.key = `re2:${JSON.stringify([source, flags])}`;
    }

    test(input: string): boolean {
        if (input.length * this.regexp.programSize() > MAX_PATTERN_MATCH_COST || patternMatchTimeSpentMs >= PATTERN_MATCH_TIME_BUDGET_MS) {
            throw new PatternBudgetExceededError();
        }

        const started = performance.now();
        try {
            // `find()` always runs the NFA, whose memory is bounded by the program size,
            // unlike `test()` which can grow a lazy DFA cache that outlives the call.
            return this.regexp.matcher(input).find();
        } finally {
            patternMatchTimeSpentMs += performance.now() - started;
        }
    }

    toString(): string {
        return this.key;
    }
}

function boundedRegExp(pattern: string, flags: string): RegExpLike {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new Error('pattern_too_long');
    }

    // RE2 has no lookarounds or backreferences, so patterns using them fail to compile here
    const regexp = RE2JS.compile(RE2JS.translateRegExp(pattern));
    if (regexp.programSize() > MAX_PATTERN_PROGRAM_SIZE) {
        throw new Error('pattern_too_complex');
    }

    return new BoundedPattern(pattern, flags, regexp);
}

export const boundedRegExpEngine: RegExpEngine = Object.assign(boundedRegExp, { code: 'boundedRegExp' });

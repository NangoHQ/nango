import * as vm from 'node:vm';

import { SDKError } from '@nangohq/runner-sdk';
import { metrics } from '@nangohq/utils';

import type { CreateAnyResponse } from '@nangohq/runner-sdk';

export class InvalidTransformError extends SDKError {
    code = 'invalid_inline_source';
}

export class TransformTimeoutError extends SDKError {
    code = 'inline_function_timeout';
}

export const transformTimeoutMs = 10_000;

const AsyncFunction = vm.runInNewContext('(async function () {}).constructor') as new (...args: string[]) => unknown;

// Input and output cross as JSON so the code never holds a runner object.
// The outcome lands in a state object because a promise from this context only settles while the context evaluates.
const driver = `(run) => (input) => {
    const state = { done: false };
    run(JSON.parse(input)).then(
        (output) => {
            try {
                state.output = output === undefined ? undefined : JSON.stringify(output);
            } catch (error) {
                state.error = error;
                state.failed = true;
            }
            state.done = true;
        },
        (error) => { state.error = error; state.failed = true; state.done = true; }
    );
    return state;
}`;

const call = new vm.Script('invoke(input)');

interface TransformState {
    done: boolean;
    failed?: boolean;
    output?: string;
    error?: unknown;
}

// The code is an async function body. It reads the invocation input as `result` and its return value is the output.
export function compileTransform({
    code,
    filename,
    timeoutMs = transformTimeoutMs
}: {
    code: string;
    filename: string;
    timeoutMs?: number;
}): CreateAnyResponse {
    let script: vm.Script;
    try {
        script = new vm.Script(`(async function (result) {\n${code}\n})`, { filename, lineOffset: -1 });
    } catch (err) {
        throw new InvalidTransformError(describeSyntaxError({ err, code, filename }));
    }
    try {
        new AsyncFunction('result', code);
    } catch {
        throw new InvalidTransformError({ message: 'The code must be a single function body' });
    }

    const context = vm.createContext(Object.create(null) as object, { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' });
    const run = script.runInContext(context) as unknown;
    const invoke = (vm.runInContext(driver, context) as (run: unknown) => (input: string) => TransformState)(run);

    const runOnce = (input: unknown): unknown => {
        Object.assign(context, { invoke, input: JSON.stringify(input ?? null) });
        const startedAt = performance.now();
        let state: TransformState;
        try {
            state = call.runInContext(context, { timeout: timeoutMs }) as TransformState;
        } catch (err) {
            if ((err as { code?: unknown }).code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
                throw err;
            }
            recordDuration(startedAt, 'timeout');
            throw new TransformTimeoutError({
                message: `The code ran longer than ${timeoutMs / 1000}s. Do less work per call, such as filtering before sorting.`
            });
        }
        if (!state.done) {
            recordDuration(startedAt, 'unsettled');
            throw new InvalidTransformError({ message: 'The code awaited something that never settles' });
        }
        recordDuration(startedAt, state.failed ? 'error' : 'success');
        if (state.failed) {
            throw state.error;
        }
        return state.output === undefined ? null : (JSON.parse(state.output) as unknown);
    };

    return {
        type: 'function',
        description: 'Inline function',
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        exec: (_nango, trigger) => new Promise((resolve) => resolve(runOnce(trigger.input)))
    };
}

function recordDuration(startedAt: number, outcome: 'success' | 'error' | 'timeout' | 'unsettled'): void {
    metrics.distribution(metrics.Types.RUNNER_INLINE_FUNCTION_DURATION_MS, performance.now() - startedAt, { outcome });
}

function describeSyntaxError({ err, code, filename }: { err: unknown; code: string; filename: string }): { message: string; line?: number } {
    const { message, stack } = err as { message?: unknown; stack?: unknown };
    const location = typeof stack === 'string' ? stack.split('\n', 1)[0] : undefined;
    const line = location?.startsWith(`${filename}:`) ? Number(location.slice(filename.length + 1)) : NaN;
    const lineCount = code.split('\n').length;
    return {
        message: typeof message === 'string' ? message : 'The code is not a valid function body',
        ...(Number.isInteger(line) && { line: Math.min(line, lineCount) })
    };
}

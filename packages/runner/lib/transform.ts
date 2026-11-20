import * as vm from 'node:vm';

import { SDKError } from '@nangohq/runner-sdk';

export class InvalidTransformError extends SDKError {
    code = 'invalid_inline_source';
}

export interface TransformFunction {
    type: 'function';
    exec: (nango: unknown, trigger: { input?: unknown }) => Promise<unknown>;
}

// Rejects code that closes the function it is compiled into. It comes from a throwaway context and what it builds is never called.
const AsyncFunction = vm.runInNewContext('(async function () {}).constructor') as new (...args: string[]) => unknown;

// The input and the output cross the context as JSON strings, so the code never holds an object of the runner.
const driver = `(run) => async (input) => {
    const output = await run(JSON.parse(input));
    return output === undefined ? undefined : JSON.stringify(output);
}`;

// The code is an async function body. It reads the invocation input as `record` and its return value is the output.
export function compileTransform({ code, filename }: { code: string; filename: string }): TransformFunction {
    let script: vm.Script;
    try {
        script = new vm.Script(`(async function (record) {\n${code}\n})`, { filename, lineOffset: -1 });
    } catch (err) {
        throw new InvalidTransformError(describeSyntaxError({ err, code, filename }));
    }
    try {
        new AsyncFunction('record', code);
    } catch {
        throw new InvalidTransformError({ message: 'The code must be a single function body' });
    }

    const context = vm.createContext(Object.create(null) as object, { codeGeneration: { strings: false, wasm: false } });
    const run = script.runInContext(context) as unknown;
    const invoke = (vm.runInContext(driver, context) as (run: unknown) => (input: string) => Promise<string | undefined>)(run);

    return {
        type: 'function',
        exec: async (_nango, trigger) => {
            const output = await invoke(JSON.stringify(trigger.input ?? null));
            return output === undefined ? null : (JSON.parse(output) as unknown);
        }
    };
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

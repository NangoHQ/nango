import * as vm from 'node:vm';

import { SDKError } from '@nangohq/runner-sdk';

import type { CreateAnyResponse } from '@nangohq/runner-sdk';

export class InvalidTransformError extends SDKError {
    code = 'invalid_inline_source';
}

const AsyncFunction = vm.runInNewContext('(async function () {}).constructor') as new (...args: string[]) => unknown;

// Input and output cross as JSON so the code never holds a runner object.
const driver = `(run) => async (input) => {
    const output = await run(JSON.parse(input));
    return output === undefined ? undefined : JSON.stringify(output);
}`;

// The code is an async function body. It reads the invocation input as `result` and its return value is the output.
export function compileTransform({ code, filename }: { code: string; filename: string }): CreateAnyResponse {
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

    const context = vm.createContext(Object.create(null) as object, { codeGeneration: { strings: false, wasm: false } });
    const run = script.runInContext(context) as unknown;
    const invoke = (vm.runInContext(driver, context) as (run: unknown) => (input: string) => Promise<string | undefined>)(run);

    return {
        type: 'function',
        description: 'Inline function',
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
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

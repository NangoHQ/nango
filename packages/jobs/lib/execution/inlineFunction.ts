import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';

export const INLINE_FUNCTION_NAME = 'inline';

const AsyncFunction = (async () => Promise.resolve()).constructor as new (...args: string[]) => unknown;

/**
 * Builds a function from code carried by the task instead of a deployed version.
 * The code is an async function body. It reads the invocation input as `record` and its return value is the output.
 * The result has the shape of a compiled `createTool`, so the runner loads it like any deployed function.
 */
export function buildInlineFunction(code: string): Result<string> {
    try {
        // Compiles the body on its own without running it. Code that parses here cannot close the template's function to reach `nango`.
        new AsyncFunction('record', code);
    } catch (err) {
        return Err(new Error(`Invalid inline source: ${err instanceof Error ? err.message : String(err)}`));
    }

    // The code starts on the first line so the line numbers of its stack traces match the source.
    return Ok(`var __inlineSource = async function (record, nango) {${code}
};
module.exports.default = {
    type: 'function',
    _nangoFactory: 'tool',
    exec: (_nango, trigger) => __inlineSource.call(undefined, trigger.input)
};`);
}

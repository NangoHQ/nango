import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';

export const INLINE_FUNCTION_NAME = 'inline';

const AsyncFunction = (async () => Promise.resolve()).constructor as new (...args: string[]) => unknown;

// The code is an async function body. It reads the invocation input as `record` and its return value is the output.
export function buildInlineFunction(code: string): Result<string> {
    try {
        // Code that parses here cannot close the template's function to reach `nango`.
        new AsyncFunction('record', code);
    } catch (err) {
        return Err(new Error(`Invalid inline source: ${err instanceof Error ? err.message : String(err)}`));
    }

    return Ok(`var __inlineSource = async function (record) {${code}
};
module.exports.default = {
    type: 'function',
    _nangoFactory: 'tool',
    exec: (_nango, trigger) => __inlineSource.call(undefined, trigger.input)
};`);
}

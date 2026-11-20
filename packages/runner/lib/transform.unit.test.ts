import { describe, expect, it } from 'vitest';

import { exec } from './exec.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';

const nangoProps: NangoProps = {
    scriptType: 'function',
    execMode: 'transform',
    host: 'http://localhost:3003',
    connectionId: 'connection-id',
    environmentId: 1,
    environmentName: 'dev',
    providerConfigKey: 'provider-config-key',
    provider: 'provider',
    activityLogId: '1',
    secretKey: 'secret-key',
    nangoConnectionId: 1,
    syncConfig: { sync_name: 'inline' } as DBSyncConfig,
    debug: false,
    startedAt: new Date(),
    team: { id: 1, name: 'dev' },
    logger: { level: 'off' },
    runnerFlags: {
        validateActionInput: false,
        validateActionOutput: false,
        validateSyncMetadata: false,
        validateSyncRecords: false,
        exportRunnerTelemetry: false
    },
    endUser: null,
    heartbeatTimeoutSecs: 30
};

async function run(code: string, input: unknown = null, props: Partial<NangoProps> = {}) {
    return await exec({
        nangoProps: { ...nangoProps, ...props },
        code,
        codeParams: { kind: 'invoke', input, connection: { connectionId: 'connection-id', integrationId: 'provider-config-key' } }
    });
}

async function failure(code: string, input: unknown = null) {
    const res = await run(code, input);
    if (res.isOk()) {
        throw new Error('Expected an error');
    }
    return res.error.toJSON();
}

describe('exec in transform mode', () => {
    it('runs the code over the invocation input and returns its value', async () => {
        const res = await run(`return record.emails.filter((email) => email.unread).map((email) => email.id);`, {
            emails: [
                { id: 'a', unread: true },
                { id: 'b', unread: false },
                { id: 'c', unread: true }
            ]
        });

        expect(res.unwrap().output).toEqual(['a', 'c']);
    });

    it('lets the code await', async () => {
        const res = await run(`const value = await Promise.resolve(record.value); return value * 2;`, { value: 21 });

        expect(res.unwrap().output).toBe(42);
    });

    it('returns null when the code returns nothing', async () => {
        const res = await run(`record.value;`, { value: 1 });

        expect(res.unwrap().output).toBeNull();
    });

    it('accepts code that ends with a line comment', async () => {
        const res = await run(`return record.value; // done`, { value: 7 });

        expect(res.unwrap().output).toBe(7);
    });

    it('gives the code nothing but the language built-ins', async () => {
        const res = await run(
            `return [typeof nango, typeof require, typeof module, typeof exports, typeof process, typeof fetch, typeof setTimeout, typeof Buffer];`
        );

        expect(res.unwrap().output).toEqual(Array(8).fill('undefined'));
    });

    it.each([
        ['the constructor of the input', `return record.constructor.constructor('return typeof process')();`],
        ['eval', `return eval('typeof process');`],
        ['an async function constructor', `return (async () => {}).constructor('return typeof process')();`]
    ])('does not let the code build new code through %s', async (_name, code) => {
        const error = await failure(code, { value: 1 });

        expect(error.type).toBe('script_internal_error');
        expect(error.payload).toMatchObject({ name: 'EvalError' });
    });

    it('reports an error thrown by the code with the line it was thrown from', async () => {
        const error = await failure(`const items = record.items;\nreturn items.length;`, {});

        expect(error.type).toBe('script_internal_error');
        expect(error.payload).toMatchObject({
            name: 'TypeError',
            message: "Cannot read properties of undefined (reading 'length')",
            stacktrace: expect.arrayContaining([expect.stringContaining('inline-provider-config-key.cjs:2:')])
        });
    });

    it.each([
        ['a syntax error', `const value = record.value;\nreturn value.`, { message: "Unexpected token '}'", line: 2 }],
        ['an import', `import fs from 'node:fs';\nreturn 1;`, { message: 'Cannot use import statement outside a module', line: 1 }],
        ['code that closes its function', `}); globalThis.escaped = true; (async function () {`, { message: 'The code must be a single function body' }]
    ])('rejects %s before running anything', async (_name, code, payload) => {
        const error = await failure(code, { value: 1 });

        expect(error.type).toBe('invalid_inline_source');
        expect(error.payload).toEqual(payload);
    });

    it('only runs functions in transform mode', async () => {
        const res = await run(`return 1;`, null, { scriptType: 'action' });

        expect(res.isErr() && res.error.toJSON().payload).toMatchObject({ message: 'Only a function can run in transform mode' });
    });

    it('still loads a module when no mode is set', async () => {
        const res = await run(
            `exports.default = { type: 'function', exec: async (nango, trigger) => trigger.input.value };`,
            { value: 3 },
            { execMode: undefined }
        );

        expect(res.unwrap().output).toBe(3);
    });
});

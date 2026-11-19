import { describe, expect, it } from 'vitest';

import { exec } from '@nangohq/nango-runner';

import { buildInlineFunction, INLINE_FUNCTION_NAME } from './inlineFunction.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';

const nangoProps: NangoProps = {
    scriptType: 'function',
    host: 'http://localhost:3003',
    connectionId: 'connection-id',
    environmentId: 1,
    environmentName: 'dev',
    providerConfigKey: 'provider-config-key',
    provider: 'provider',
    activityLogId: '1',
    secretKey: 'secret-key',
    nangoConnectionId: 1,
    syncConfig: { sync_name: INLINE_FUNCTION_NAME } as DBSyncConfig,
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

async function run(source: string, input: unknown = null) {
    const code = buildInlineFunction(source).unwrap();
    return await exec({
        nangoProps,
        code,
        codeParams: { kind: 'invoke', input, connection: { connectionId: 'connection-id', integrationId: 'provider-config-key' } }
    });
}

describe('buildInlineFunction', () => {
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

    it('supports await', async () => {
        const res = await run(`const value = await Promise.resolve(record.value); return value * 2;`, { value: 21 });

        expect(res.unwrap().output).toBe(42);
    });

    it('returns null when the code returns nothing', async () => {
        const res = await run(`record.value;`, { value: 1 });

        expect(res.unwrap().output).toBeNull();
    });

    it('does not expose nango to the code', async () => {
        const scoped = await run(`return typeof nango;`);
        const throughCaller = await run(`return module.exports.default.exec.arguments;`);

        expect(scoped.unwrap().output).toBe('undefined');
        expect(throughCaller.isErr() && throughCaller.error.toJSON().payload).toMatchObject({ name: 'TypeError' });
    });

    it('reports an error thrown by the code with the line it was thrown from', async () => {
        const res = await run(`const items = record.items;\nreturn items.length;`, {});

        if (res.isOk()) {
            throw new Error('Expected an error');
        }
        const error = res.error.toJSON();
        expect(error.type).toBe('script_internal_error');
        expect(error.payload).toMatchObject({
            name: 'TypeError',
            stacktrace: expect.arrayContaining([expect.stringContaining('inline-provider-config-key.cjs:2:')])
        });
    });

    it.each([
        ['a syntax error', `return data.`],
        [
            'code that closes the template function',
            `}; module.exports.default = { type: 'function', exec: (nango) => nango.getConnection() }; var ignored = async function () {`
        ],
        ['an import', `import fs from 'node:fs'; return 1;`]
    ])('rejects %s', (_name, source) => {
        const res = buildInlineFunction(source);

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toMatch(/^Invalid inline source: /);
        }
    });

    it('keeps code that ends with a line comment', async () => {
        const res = await run(`return record.value; // done`, { value: 7 });

        expect(res.unwrap().output).toBe(7);
    });
});

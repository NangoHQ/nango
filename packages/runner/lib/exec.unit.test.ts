import { expect, describe, it } from 'vitest';
import { exec } from './exec.js';
import type { NangoProps, SyncConfig } from '@nangohq/shared';

function getNangoProps(): NangoProps {
    return {
        scriptType: 'sync',
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: 1,
        providerConfigKey: 'provider-config-key',
        provider: 'provider',
        activityLogId: '1',
        secretKey: 'secret-key',
        nangoConnectionId: 1,
        syncId: 'sync-id',
        syncJobId: 1,
        lastSyncDate: new Date(),
        dryRun: true,
        attributes: {},
        track_deletes: false,
        logMessages: {
            counts: { updated: 0, added: 0, deleted: 0 },
            messages: []
        },
        syncConfig: {} as SyncConfig,
        debug: false,
        startedAt: new Date(),
        runnerFlags: {} as any,
        stubbedMetadata: {}
    };
}

describe('Exec', () => {
    it('execute code', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        f = async (nango) => {
            const s = nango.lastSyncDate.toISOString();
            const b = Buffer.from("hello world");
            const t = await Promise.resolve(setTimeout(() => {}, 5));
        };
        exports.default = f
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual(null);
        expect(res.success).toEqual(true);
    });

    it('should return a formatted error when receiving an Error', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new Error('foobar')
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual({
            payload: {
                message: 'foobar',
                name: 'Error'
            },
            status: 500,
            type: 'script_internal_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should return a formatted error when receiving an ActionError', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new nango.ActionError({ message: 'foobar', prop: 'foobar' })
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual({
            payload: {
                message: 'foobar',
                prop: 'foobar'
            },
            status: 500,
            type: 'action_script_runtime_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should return a formatted error when receiving an ActionError with an array', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new nango.ActionError([{id: "foobar"}])
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual({
            payload: {
                message: [{ id: 'foobar' }]
            },
            status: 500,
            type: 'action_script_runtime_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should return a formatted error when receiving an invalid error', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new Object({})
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);
        expect(res.error).toEqual({
            payload: {
                name: 'Error'
            },
            status: 500,
            type: 'script_internal_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should return a formatted error when receiving an AxiosError (without a body)', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            await nango.get({
                endpoint: '/',
                baseUrl: 'https://example.dev/'
            })
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        // NB: it will fail because Nango is not running not because the website is not reachable
        // NB2: the message is different depending on the system running Node
        expect(res.error).toMatchObject({
            payload: {
                code: 'ECONNREFUSED'
            },
            status: 500,
            type: 'script_http_error'
        });
        expect(res.success).toEqual(false);
    });
});

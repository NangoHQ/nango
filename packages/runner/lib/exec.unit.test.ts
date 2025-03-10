import { expect, describe, it } from 'vitest';
import { exec } from './exec.js';
import type { DBSyncConfig, NangoProps } from '@nangohq/types';

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
        attributes: {},
        track_deletes: false,
        syncConfig: {} as DBSyncConfig,
        debug: false,
        startedAt: new Date(),
        runnerFlags: {
            validateActionInput: false,
            validateActionOutput: false,
            validateSyncMetadata: false,
            validateSyncRecords: false
        },
        endUser: null
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

    it('should return a script_network_error when receiving an AxiosError (without a body)', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            const err = new Error("Something broke");
            err.isAxiosError = true;
            err.code = "ECONNREFUSED";

            throw err;
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        expect(res.error).toMatchObject({
            payload: {
                code: 'ECONNREFUSED'
            },
            status: 500,
            type: 'script_network_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should return a script_network_error when receiving an AxiosError (without a body)', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            const err = new Error("Something broke");
            err.isAxiosError = true;
            err.code = "ERR_BAD_RESPONSE";
            err.response = {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Security-Policy': 'blech',
                    'X-RateLimit-Limit': '100',
                },
                data: { error: "Not found" }
            }
            throw err;
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        // NB: it will fail because Nango is not running not because the website is not reachable
        // NB2: the message is different depending on the system running Node
        expect(res.error).toEqual({
            payload: {
                error: 'Not found'
            },
            status: 404,
            additional_properties: {
                upstream_response: {
                    body: {
                        error: 'Not found'
                    },
                    headers: {
                        'content-type': 'application/json',
                        'x-ratelimit-limit': '100'
                    },
                    status: 404
                }
            },
            type: 'script_http_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should truncate a large error', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new nango.ActionError({
                message: "A manual error",
                reason: "a".repeat(1_000_000),
            });
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        expect(res.error).toStrictEqual({
            payload: {
                message: 'A manual error'
            },
            status: 500,
            type: 'action_script_runtime_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should redact Authorization', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            throw new nango.ActionError({
                message: "A manual error",
                Authorization: 'a very secret secret'
            });
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        expect(res.error).toStrictEqual({
            payload: {
                message: 'A manual error',
                Authorization: '[Redacted]'
            },
            status: 500,
            type: 'action_script_runtime_error'
        });
        expect(res.success).toEqual(false);
    });

    it('should truncate caught AxiosError', async () => {
        const nangoProps = getNangoProps();
        const jsCode = `
        fn = async (nango) => {
            try {
                await nango.getConnection();
            } catch (err) {
                throw new nango.ActionError({
                    message: "A manual error",
                    reason: err,
                });
            }
        };
        exports.default = fn
        `;
        const res = await exec(nangoProps, jsCode);

        expect(res.error).toStrictEqual({
            payload: {
                message: 'A manual error',
                reason: {
                    code: expect.any(String),
                    config: {
                        adapter: ['xhr', 'http', 'fetch'],
                        env: {},
                        headers: {
                            Accept: 'application/json, text/plain, */*',
                            'Accept-Encoding': 'gzip, compress, deflate, br',
                            Authorization: '[Redacted]',
                            'Content-Type': 'application/json',
                            'Nango-Is-Dry-Run': 'true',
                            'Nango-Is-Sync': 'true',
                            'User-Agent': expect.any(String)
                        },
                        maxBodyLength: -1,
                        maxContentLength: -1,
                        method: 'get',
                        params: {
                            force_refresh: false,
                            provider_config_key: 'provider-config-key',
                            refresh_token: false
                        },
                        timeout: 0,
                        transformRequest: [null],
                        transformResponse: [null],
                        transitional: {
                            clarifyTimeoutError: false,
                            forcedJSONParsing: true,
                            silentJSONParsing: true
                        },
                        url: 'http://localhost:3003/connection/connection-id',
                        xsrfCookieName: 'XSRF-TOKEN',
                        xsrfHeaderName: 'X-XSRF-TOKEN'
                    },
                    message: expect.any(String),
                    name: expect.any(String)
                }
            },
            status: 500,
            type: 'action_script_runtime_error'
        });
        expect(res.success).toEqual(false);
    });
});

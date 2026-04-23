/**
 * Deno subprocess entry: loads user CJS and drives the same dispatch rules as the Node VM path,
 * calling back into the Node harness via stdio JSON-RPC.
 */
import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { stdin, stdout } from 'node:process';
import * as readline from 'node:readline';
import * as url from 'node:url';

import type * as BotbuilderModule from 'botbuilder';
import type * as SoapModule from 'soap';
import type * as SuperJsonModule from 'superjson';
import type * as UnzipperModule from 'unzipper';
import type * as ZodModule from 'zod';

type SerializedSuperJson = ReturnType<SuperJsonModule.serialize>;

let SuperJSON: SuperJsonModule;
let zod: typeof ZodModule;
let botbuilder: typeof BotbuilderModule;
let soap: typeof SoapModule;
let unzipper: typeof UnzipperModule;

let nodeRequire: ReturnType<typeof createRequire>;

function initNodeRequireFromLambdaTaskRoot(): void {
    const lambdaRoot = Deno.env.get('LAMBDA_TASK_ROOT');
    if (!lambdaRoot) {
        throw new Error('LAMBDA_TASK_ROOT is required for Deno subprocess bootstrap (expected Lambda runtime)');
    }

    const pkgJson = path.join(lambdaRoot, 'package.json');
    nodeRequire = createRequire(pkgJson);

    SuperJSON = nodeRequire('superjson') as SuperJsonModule;
    zod = nodeRequire('zod') as typeof ZodModule;
    botbuilder = nodeRequire('botbuilder') as typeof BotbuilderModule;
    soap = nodeRequire('soap') as typeof SoapModule;
    unzipper = nodeRequire('unzipper') as typeof UnzipperModule;
}

interface RpcMsg {
    v: 1;
    id: number;
    call: { path: string[]; args: SerializedSuperJson } | { iterNext: string };
}

interface RpcResp {
    v: 1;
    id: number;
    result?: SerializedSuperJson;
    error?: { message: string; stack?: string; name?: string };
}

interface InitMsg {
    v: 1;
    init: SerializedSuperJson;
}

/** Mirrors @nangohq/runner-sdk ActionError enough for user scripts */
class ActionError extends Error {
    type: string;
    payload?: Record<string, unknown>;
    constructor(payload?: Record<string, unknown>) {
        super();
        this.type = 'action_script_runtime_error';
        this.name = 'ActionError';
        if (payload) {
            this.payload = payload;
        }
    }
}

let nextId = 0;
const pending = new Map<number, (resp: RpcResp) => void>();

function writeLine(obj: unknown): void {
    stdout.write(`${JSON.stringify(obj)}\n`);
}

function wireLineHandler(rl: readline.Interface): void {
    rl.on('line', (line: string) => {
        if (!line.trim()) {
            return;
        }
        try {
            const msg = JSON.parse(line) as RpcResp;
            if (msg.v !== 1 || msg.id === undefined) {
                return;
            }
            const fn = pending.get(msg.id);
            if (fn) {
                pending.delete(msg.id);
                fn(msg);
            }
        } catch {
            //
        }
    });
}

async function rpcRaw(msg: RpcMsg): Promise<RpcResp> {
    return await new Promise((resolve, reject) => {
        pending.set(msg.id, resolve);
        writeLine(msg);
        setTimeout(
            () => {
                if (pending.has(msg.id)) {
                    pending.delete(msg.id);
                    reject(new Error(`RPC timeout for id ${msg.id}`));
                }
            },
            1000 * 60 * 14
        ).unref?.();
    });
}

async function invokePath(path: string[], args: unknown[]): Promise<unknown> {
    const id = ++nextId;
    const res = await rpcRaw({
        v: 1,
        id,
        call: { path, args: SuperJSON.serialize(args) }
    });
    if (res.error) {
        const e = new Error(res.error.message);
        e.stack = res.error.stack;
        e.name = res.error.name || 'Error';
        throw e;
    }
    const val = SuperJSON.deserialize(res.result as never);
    if (val && typeof val === 'object' && (val as { __nangoIterator?: boolean }).__nangoIterator) {
        const iterId = (val as { iteratorId: string }).iteratorId;
        async function* gen(): AsyncGenerator {
            while (true) {
                const step = await iterNext(iterId);
                if (step.done) {
                    return;
                }
                yield step.value;
            }
        }
        const iterable: AsyncIterable<unknown> = {
            [Symbol.asyncIterator]: () => gen()[Symbol.asyncIterator]()
        };
        return iterable;
    }
    return val;
}

async function iterNext(iterId: string): Promise<{ done?: boolean; value?: unknown }> {
    const id = ++nextId;
    const res = await rpcRaw({ v: 1, id, call: { iterNext: iterId } });
    if (res.error) {
        const e = new Error(res.error.message);
        throw e;
    }
    return SuperJSON.deserialize(res.result as never);
}

function iteratorMethodsReturningSyncIterable(): Set<string> {
    return new Set(['listRecords', 'paginate']);
}

function buildStub(): unknown {
    const snap = { ...initGlobal.snapshot, ActionError };
    return new Proxy(snap, {
        get(_t, prop: string | symbol, _rec) {
            if (typeof prop === 'symbol') {
                return Reflect.get(snap, prop, snap);
            }
            if (prop in snap) {
                return Reflect.get(snap, prop, snap);
            }
            return mkChain([prop]);
        }
    });

    function mkChain(pathKeys: string[]): unknown {
        const last = pathKeys[pathKeys.length - 1] || '';
        const isIteratorMethod = iteratorMethodsReturningSyncIterable().has(last);

        const callable = function () {
            /* bound by apply trap */
        };
        return new Proxy(callable, {
            apply(_fn, _this, args) {
                if (isIteratorMethod) {
                    return makeLazyAsyncIterable(() => invokePath(pathKeys, [...args]));
                }
                return invokePath(pathKeys, [...args]);
            },
            get(_fn, prop: string | symbol) {
                if (typeof prop === 'symbol') {
                    return undefined;
                }
                return mkChain([...pathKeys, prop]);
            }
        });
    }
}

function makeLazyAsyncIterable(factory: () => Promise<unknown>): AsyncIterable<unknown> {
    return {
        [Symbol.asyncIterator]() {
            let innerIt: AsyncIterator<unknown> | null = null;
            return {
                async next() {
                    if (!innerIt) {
                        const res = await factory();
                        if (res && typeof res === 'object' && Symbol.asyncIterator in res) {
                            innerIt = (res as AsyncIterable<unknown>)[Symbol.asyncIterator]();
                        } else {
                            throw new Error('Expected async iterable from harness');
                        }
                    }
                    return await innerIt.next();
                },
                return: async () => {
                    if (innerIt?.return) {
                        return await innerIt.return();
                    }
                    return { done: true, value: undefined };
                }
            };
        }
    };
}

let initGlobal: {
    snapshot: Record<string, unknown>;
    nangoProps: { scriptType: 'sync' | 'action' | 'webhook' | 'on-event'; syncConfig: { sync_name?: string; sdk_version?: string } };
    codeParams: object;
    isEnterprise: boolean;
    userCodePath: string;
};

function wrappedRequire(moduleName: string): unknown {
    switch (moduleName) {
        case 'url':
            return url;
        case 'crypto':
            return crypto;
        case 'zod':
            return zod;
        case 'botbuilder':
            return botbuilder;
        case 'soap':
            return soap;
        case 'unzipper':
            return unzipper;
        default:
            throw new Error(`Module '${moduleName}' is not allowed`);
    }
}

function parseExports(raw: unknown): {
    onWebhookPayloadReceived?: (nango: unknown, payload?: object) => Promise<unknown>;
    default: unknown;
} {
    return raw as { onWebhookPayloadReceived?: (nango: unknown, payload?: object) => Promise<unknown>; default: unknown };
}

async function dispatchInline(params: {
    nangoProps: { scriptType: 'sync' | 'action' | 'webhook' | 'on-event'; syncConfig: { sync_name?: string; sdk_version?: string } };
    nango: unknown;
    scriptExports: ReturnType<typeof parseExports>;
    codeParams?: object;
    isEnterprise: boolean;
}): Promise<{ output: unknown }> {
    const { nangoProps, nango, scriptExports: raw, codeParams, isEnterprise } = params;
    const def = raw.default;
    const isZeroYaml = typeof def === 'object' && def !== null;
    const isNangoYaml = !isZeroYaml && typeof raw.default === 'function';

    if (!isZeroYaml && !isNangoYaml) {
        throw new Error(`Invalid script exports`);
    }
    if (isZeroYaml && (!nangoProps.syncConfig.sdk_version || !nangoProps.syncConfig.sdk_version.includes('-zero'))) {
        throw new Error(`Invalid script configuration`);
    }

    if (nangoProps.scriptType === 'webhook') {
        if (isZeroYaml) {
            const payload = def as { type?: string; onWebhook?: (n: unknown, p?: object) => Promise<unknown> };
            if (payload.type !== 'sync') {
                throw new Error('Incorrect script loaded for webhook');
            }
            if (!payload.onWebhook) {
                throw new Error(`Missing onWebhook function`);
            }
            const output = await payload.onWebhook(nango, codeParams);
            return { output };
        }
        if (!raw.onWebhookPayloadReceived) {
            throw new Error(`There is no onWebhookPayloadReceived export`);
        }
        const output = await raw.onWebhookPayloadReceived(nango, codeParams);
        return { output };
    }

    if (nangoProps.scriptType === 'action') {
        let inputParams: unknown = codeParams;
        if (typeof codeParams === 'object' && codeParams !== null && Object.keys(codeParams).length === 0) {
            inputParams = undefined;
        }
        let output: unknown;
        if (isZeroYaml) {
            const payload = def as { type?: string; exec?: (n: unknown, p?: object) => Promise<unknown> };
            if (payload.type !== 'action') {
                throw new Error('Incorrect script loaded for action');
            }
            if (!payload.exec) {
                throw new Error(`Missing exec function`);
            }
            output = await payload.exec(nango, codeParams);
        } else {
            output = await (def as (n: unknown, p?: unknown) => Promise<unknown>)(nango, inputParams);
        }
        if (output) {
            const stringifiedOutput = JSON.stringify(output);
            const outputSizeInBytes = Buffer.byteLength(stringifiedOutput, 'utf8');
            const maxSizeInBytes = 2 * 1024 * 1024;
            if (!isEnterprise && outputSizeInBytes > maxSizeInBytes) {
                throw new Error(
                    `Output size is too large: ${outputSizeInBytes} bytes. Maximum allowed size is ${maxSizeInBytes} bytes (2MB). See the deprecation announcement: https://nango.dev/docs/updates/dev#august-22%2C-2025`
                );
            }
        }
        return { output };
    }

    if (nangoProps.scriptType === 'on-event') {
        let output: unknown;
        if (isZeroYaml) {
            const payload = def as { type?: string; exec?: (n: unknown) => Promise<unknown> };
            if (payload.type !== 'onEvent') {
                throw new Error('Incorrect script loaded for action');
            }
            if (!payload.exec) {
                throw new Error(`Missing exec function`);
            }
            output = await payload.exec(nango);
        } else {
            output = await (def as (n: unknown) => Promise<unknown>)(nango);
        }
        return { output };
    }

    if (isZeroYaml) {
        const payload = def as { type?: string; exec?: (n: unknown) => Promise<void> };
        if (payload.type !== 'sync') {
            throw new Error('Incorrect script loaded for sync');
        }
        if (!payload.exec) {
            throw new Error(`Missing exec function`);
        }
        await payload.exec(nango);
        return { output: true };
    }

    await (def as (n: unknown) => Promise<void>)(nango);
    return { output: true };
}

async function main() {
    const userPath = Deno.args[0];
    if (!userPath) {
        throw new Error('Missing user script path argument');
    }

    initNodeRequireFromLambdaTaskRoot();

    const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
    const initLine: string = await new Promise((resolve) => {
        rl.once('line', resolve);
    });
    wireLineHandler(rl);

    const initParsed = JSON.parse(initLine) as InitMsg;
    if (initParsed.v !== 1 || !initParsed.init) {
        throw new Error('Invalid init');
    }
    initGlobal = SuperJSON.deserialize(initParsed.init as never);
    const pathToLoad = initGlobal.userCodePath || userPath;

    const code = await fs.promises.readFile(pathToLoad, 'utf8');
    // Intentional dynamic module wrap: user CJS must run with injected require (same role as vm in Node).
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- host-supplied bundle boundary; no static alternative for arbitrary CJS
    const runUserModule = new Function(
        '____req',
        `
        return (function() {
            var module = { exports: {} };
            var exports = module.exports;
            function require(m) { return ____req(m); }
            ${code}
            return module.exports;
        })();
        `
    ) as (req: (m: string) => unknown) => Record<string, unknown>;

    const scriptExports = runUserModule(wrappedRequire);

    const nangoStub = buildStub() as Record<string, unknown>;

    const out = await dispatchInline({
        nangoProps: initGlobal.nangoProps,
        nango: nangoStub as never,
        scriptExports: parseExports(scriptExports),
        codeParams: initGlobal.codeParams,
        isEnterprise: initGlobal.isEnterprise
    });

    writeLine({
        v: 1,
        done: {
            ok: true,
            result: SuperJSON.serialize(out)
        }
    });
}

main().catch((err: unknown) => {
    const payload =
        err instanceof ActionError
            ? SuperJSON.serialize({
                  __crossProcessActionError: true,
                  type: err.type,
                  payload: err.payload
              })
            : err instanceof Error
              ? SuperJSON.serialize({
                    message: err.message,
                    stack: err.stack,
                    name: err.name
                })
              : SuperJSON.serialize({ message: String(err) });
    writeLine({
        v: 1,
        done: {
            ok: false,
            error: payload
        }
    });
    Deno.exit(1);
});

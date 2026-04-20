import * as readline from 'node:readline';

import SuperJSON from 'superjson';

import type { RpcMessageFromChild, RpcMessageToChild, SuperJsonPayload } from './protocol.js';
import type { NangoActionRunner, NangoSyncRunner } from '../sdk/sdk.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export function toSuperJsonPayload(value: unknown): SuperJsonPayload {
    return SuperJSON.serialize(value) as SuperJsonPayload;
}

export function fromSuperJsonPayload<T>(p: SuperJsonPayload): T {
    return SuperJSON.deserialize(p as never);
}

function stripAxiosLikeResponse(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
        return value;
    }
    const v = value as Record<string, unknown>;
    if ('status' in v && 'data' in v && 'headers' in v) {
        return {
            data: v['data'],
            status: v['status'],
            statusText: v['statusText'],
            headers: v['headers'],
            config: v['config'] ? { url: (v['config'] as { url?: string })?.url } : undefined
        };
    }
    return value;
}

function safeSerialize(value: unknown): SuperJsonPayload {
    try {
        const normalized = stripAxiosLikeResponse(value);
        return toSuperJsonPayload(normalized);
    } catch {
        return toSuperJsonPayload(stripAxiosLikeResponse(value));
    }
}

function getNested(obj: unknown, path: string[]): unknown {
    let cur: unknown = obj;
    for (const p of path) {
        if (cur == null || typeof cur !== 'object') {
            return undefined;
        }
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function getIteratorFromResult(value: unknown): AsyncIterator<unknown> | null {
    if (value && typeof value === 'object' && Symbol.asyncIterator in value) {
        return (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }
    return null;
}

export async function runHarnessRpcLoop(
    child: ChildProcessWithoutNullStreams,
    nango: NangoActionRunner | NangoSyncRunner
): Promise<{ ok: true; result: SuperJsonPayload } | { ok: false; error: SuperJsonPayload }> {
    const iterators = new Map<string, AsyncIterator<unknown>>();
    let nextIteratorId = 0;

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

    const callPath = async (path: string[], args: unknown[]): Promise<unknown> => {
        const last = path[path.length - 1];
        if (!last) {
            throw new Error('Empty call path');
        }
        const parentPath = path.slice(0, -1);
        const parentObj = parentPath.length === 0 ? nango : getNested(nango, parentPath);
        if (parentObj == null || typeof parentObj !== 'object') {
            throw new Error(`Invalid path ${path.join('.')}`);
        }
        const fn = (parentObj as Record<string, unknown>)[last];
        if (typeof fn !== 'function') {
            throw new Error(`${path.join('.')} is not a function`);
        }
        return await (fn as (...a: unknown[]) => unknown).apply(parentObj, args);
    };

    const handleInvoke = async (path: string[], args: unknown[]): Promise<unknown> => {
        const result = await callPath(path, args);
        const iterator = getIteratorFromResult(result);
        if (iterator) {
            const iterId = `it_${nextIteratorId++}`;
            iterators.set(iterId, iterator);
            return { __nangoIterator: true as const, iteratorId: iterId };
        }
        return result;
    };

    return await new Promise((resolveLoop, rejectLoop) => {
        let finished = false;
        const fail = (err: unknown) => {
            if (finished) {
                return;
            }
            finished = true;
            rl.close();
            rejectLoop(err instanceof Error ? err : new Error(String(err)));
        };

        const write = (msg: RpcMessageToChild) => {
            if (!child.stdin.writableEnded) {
                child.stdin.write(`${JSON.stringify(msg)}\n`);
            }
        };

        child.on('error', fail);

        rl.on('line', async (line) => {
            if (!line.trim()) {
                return;
            }
            let msg: RpcMessageFromChild;
            try {
                msg = JSON.parse(line) as RpcMessageFromChild;
            } catch {
                fail(new Error('Invalid JSON line from subprocess'));
                return;
            }

            if (msg.v !== 1) {
                fail(new Error('Unsupported RPC version'));
                return;
            }

            if ('done' in msg) {
                finished = true;
                resolveLoop(msg.done);
                rl.close();
                return;
            }

            if (!('id' in msg) || !msg.call) {
                fail(new Error('Invalid RPC message'));
                return;
            }

            try {
                if ('iterNext' in msg.call) {
                    const iterId = msg.call.iterNext;
                    const it = iterators.get(iterId);
                    if (!it) {
                        throw new Error(`Unknown iterator ${iterId}`);
                    }
                    const step = await it.next();
                    if (step.done) {
                        iterators.delete(iterId);
                    }
                    write({ v: 1, id: msg.id, result: safeSerialize({ done: step.done, value: step.value }) });
                    return;
                }

                const args = fromSuperJsonPayload<unknown[]>(msg.call.args);
                const res = await handleInvoke(msg.call.path, Array.isArray(args) ? args : []);
                write({ v: 1, id: msg.id, result: safeSerialize(res) });
            } catch (err: unknown) {
                const e = err instanceof Error ? err : new Error(String(err));
                write({
                    v: 1,
                    id: msg.id,
                    error: {
                        message: e.message,
                        ...(e.stack !== undefined ? { stack: e.stack } : {}),
                        ...(e.name !== undefined ? { name: e.name } : {})
                    }
                });
            }
        });

        child.stdout.on('error', fail);
        child.stdin.on('error', fail);

        child.on('close', (code, signal) => {
            if (!finished) {
                fail(new Error(`Deno subprocess exited before sending result (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
            }
        });
    });
}

export function sendInit(child: ChildProcessWithoutNullStreams, init: SuperJsonPayload): void {
    const msg: RpcMessageToChild = { v: 1, init };
    child.stdin.write(`${JSON.stringify(msg)}\n`);
}

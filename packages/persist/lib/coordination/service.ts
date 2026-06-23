import { getKVStore } from '@nangohq/kvstore';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import * as locks from './locks.js';

import type { Result } from '@nangohq/utils';

function abortKey(taskId: string): string {
    return `function:${taskId}:abort`;
}

function conflictKey(environmentId: number, scriptType: string, syncId: string): string {
    return `function:${environmentId}:${scriptType}:${syncId}`;
}

function abortTtlMs(): number {
    return envs.RUNNER_ABORT_CHECK_INTERVAL_MS * 5;
}

async function getStore() {
    return getKVStore('customer');
}

export async function setAbortFlag(taskId: string): Promise<Result<void>> {
    try {
        const store = await getStore();
        await store.set(abortKey(taskId), '1', { ttlMs: abortTtlMs() });
        return Ok(undefined);
    } catch (err: unknown) {
        return Err(new Error(`Error setting abort flag for task: ${taskId}`, { cause: err }));
    }
}

export async function isAbortFlagSet(taskId: string): Promise<Result<boolean>> {
    try {
        const store = await getStore();
        const aborted = await store.exists(abortKey(taskId));
        return Ok(aborted);
    } catch (err: unknown) {
        return Err(new Error(`Error checking abort flag for task: ${taskId}`, { cause: err }));
    }
}

export async function acquireSyncConflict({
    environmentId,
    scriptType,
    syncId,
    refresh,
    ttlMs
}: {
    environmentId: number;
    scriptType: string;
    syncId: string;
    refresh: boolean;
    ttlMs: number;
}): Promise<Result<void>> {
    if (scriptType !== 'sync') {
        return Ok(undefined);
    }

    try {
        const store = await getStore();
        await store.set(conflictKey(environmentId, scriptType, syncId), '1', {
            canOverride: refresh,
            ttlMs
        });
        return Ok(undefined);
    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('set_key_already_exists')) {
            return Err(new Error('Conflicting sync detected'));
        }
        return Err(new Error('Failed to track sync for conflicts', { cause: err }));
    }
}

export async function releaseSyncConflict({
    environmentId,
    scriptType,
    syncId
}: {
    environmentId: number;
    scriptType: string;
    syncId: string;
}): Promise<Result<void>> {
    if (scriptType !== 'sync') {
        return Ok(undefined);
    }

    try {
        const store = await getStore();
        await store.delete(conflictKey(environmentId, scriptType, syncId));
        return Ok(undefined);
    } catch (err: unknown) {
        return Err(new Error('Failed to untrack sync', { cause: err }));
    }
}

export async function tryAcquireLock(params: { owner: string; key: string; ttlMs: number }): Promise<Result<boolean>> {
    const store = await getStore();
    return locks.tryAcquireLock(store, params);
}

export async function releaseLock(params: { owner: string; key: string }): Promise<Result<boolean>> {
    const store = await getStore();
    return locks.releaseLock(store, params);
}

export async function releaseAllLocks(params: { owner: string }): Promise<Result<void>> {
    const store = await getStore();
    return locks.releaseAllLocks(store, params);
}

export async function hasLock(params: { owner: string; key: string }): Promise<Result<boolean>> {
    const store = await getStore();
    return locks.hasLock(store, params);
}

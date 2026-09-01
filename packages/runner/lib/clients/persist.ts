import { z } from 'zod';

import { getUserAgent } from '@nangohq/node';
import { getPersistAPIUrl } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { logger } from '../logger.js';
import { httpFetch, httpStreamNDJson } from './http.js';

import type {
    Checkpoint,
    CursorOffset,
    DeleteHardAllRecordsSuccess,
    DeleteOutdatedRecordsSuccess,
    DeleteRecordsSuccess,
    GetCheckpointSuccess,
    GetCursorSuccess,
    GetRecordsSuccess,
    GetTaskAbortSuccess,
    HasLockSuccess,
    MergingStrategy,
    PostRecordsSuccess,
    PutCheckpointSuccess,
    PutRecordsSuccess,
    ReleaseLockSuccess,
    RunnerTelemetry,
    TryAcquireLockSuccess
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const deleteOutdatedRecordsTerminalLineSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('done'), deletedKeys: z.array(z.string()) }),
    z.object({ status: z.literal('error'), error: z.looseObject({ message: z.string() }) })
]);

export class PersistClient {
    private baseUrl: string;
    private secretKey: string;
    private userAgent: string;

    constructor({ secretKey }: { secretKey: string }) {
        this.secretKey = secretKey;
        this.baseUrl = getPersistAPIUrl();
        this.userAgent = getUserAgent('sdk');
    }

    /**
     * @param data - Request payload. Serialized to JSON internally.
     * @param body - Pre-serialized JSON string. Takes precedence over `data` when provided,
     *   skipping serialization. Use when the caller needs the serialized form for other purposes
     *   (e.g. byte-counting) to avoid serializing twice.
     */
    private async fetch<R>({
        method,
        path,
        data,
        body: preSerializedBody,
        params
    }: {
        method: string;
        path: string;
        data?: unknown;
        body?: string;
        params?: Record<string, string | string[]>;
    }): Promise<Result<R>> {
        if (path.length > 0 && !path.startsWith('/')) {
            return Err(new Error(`Path must start with a '/' character.`));
        }

        const searchParams = new URLSearchParams();
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (Array.isArray(value)) {
                    for (const v of value) {
                        searchParams.append(key, v);
                    }
                } else {
                    searchParams.append(key, value);
                }
            }
        }
        const queryString = searchParams.toString();
        const url = queryString ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`;

        const body = preSerializedBody ?? (data ? JSON.stringify(data) : null);
        const response = await httpFetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            body,
            userAgent: this.userAgent
        });

        if (!response.ok) {
            const responseData = await response.text();
            logger.error(`${method} ${path} failed: status=${response.status} response='${responseData}'`);
            return Err(new Error(responseData || 'Request failed with status ' + response.status));
        }

        try {
            if (response.status === 204) {
                return Ok(undefined as unknown as R);
            }
            const responseData = await response.json();
            return Ok(responseData as R);
        } catch (err) {
            return Err(new Error(`Failed to parse response: ${stringifyError(err)}`));
        }
    }

    public async postLog({ environmentId, data }: { environmentId: number; data: string }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'POST',
            path: `/environment/${environmentId}/log`,
            data: JSON.parse(data)
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to persist log entry: ${res.error.message}`));
        }
        return res;
    }

    public async postRecords<T = any>({
        model,
        records,
        environmentId,
        providerConfigKey,
        connectionId,
        nangoConnectionId,
        syncId,
        syncJobId,
        activityLogId,
        merging
    }: {
        model: string;
        records: T[];
        environmentId: number;
        providerConfigKey: string;
        connectionId: string;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        activityLogId: string;
        merging: MergingStrategy;
    }): Promise<{ result: Result<PostRecordsSuccess>; bytesSent: number }> {
        const body = JSON.stringify({ model, records, providerConfigKey, connectionId, activityLogId, merging });
        const bytesSent = Buffer.byteLength(body, 'utf8');
        const result = await this.fetch<PostRecordsSuccess>({
            method: 'POST',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            body
        });
        if (result.isErr()) {
            return { result: Err(new Error(`Failed to save records: ${result.error.message}`)), bytesSent: 0 };
        }
        return { result, bytesSent };
    }

    public async putRecords<T = any>({
        model,
        records,
        environmentId,
        providerConfigKey,
        nangoConnectionId,
        connectionId,
        syncId,
        syncJobId,
        activityLogId,
        merging
    }: {
        model: string;
        records: T[];
        environmentId: number;
        providerConfigKey: string;
        connectionId: string;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        activityLogId: string;
        merging: MergingStrategy;
    }): Promise<{ result: Result<PutRecordsSuccess>; bytesSent: number }> {
        const body = JSON.stringify({ model, records, providerConfigKey, connectionId, activityLogId, merging });
        const bytesSent = Buffer.byteLength(body, 'utf8');
        const result = await this.fetch<PutRecordsSuccess>({
            method: 'PUT',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            body
        });
        if (result.isErr()) {
            return { result: Err(new Error(`Failed to update records: ${result.error.message}`)), bytesSent: 0 };
        }
        return { result, bytesSent };
    }

    public async deleteRecords<T = any>({
        model,
        records,
        environmentId,
        providerConfigKey,
        connectionId,
        nangoConnectionId,
        syncId,
        syncJobId,
        activityLogId,
        merging
    }: {
        model: string;
        records: T[];
        environmentId: number;
        providerConfigKey: string;
        connectionId: string;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        activityLogId: string;
        merging: MergingStrategy;
    }): Promise<{ result: Result<DeleteRecordsSuccess>; bytesSent: number }> {
        const body = JSON.stringify({ model, records, providerConfigKey, connectionId, activityLogId, merging });
        const bytesSent = Buffer.byteLength(body, 'utf8');
        const result = await this.fetch<DeleteRecordsSuccess>({
            method: 'DELETE',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            body
        });
        if (result.isErr()) {
            return { result: Err(new Error(`Failed to delete records: ${result.error.message}`)), bytesSent: 0 };
        }
        return { result, bytesSent };
    }

    public async deleteHardAllRecords({
        environmentId,
        nangoConnectionId,
        syncId,
        syncJobId,
        model
    }: {
        environmentId: number;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        model: string;
    }): Promise<Result<DeleteHardAllRecordsSuccess>> {
        const res = await this.fetch<DeleteHardAllRecordsSuccess>({
            method: 'DELETE',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records/hard`,
            data: { model }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to hard delete records: ${res.error.message}`));
        }
        return res;
    }

    public async deleteOutdatedRecords({
        model,
        environmentId,
        nangoConnectionId,
        syncId,
        syncJobId,
        activityLogId
    }: {
        model: string;
        environmentId: number;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
        activityLogId: string;
    }): Promise<Result<DeleteOutdatedRecordsSuccess>> {
        const path = `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/outdated`;
        const response = await httpFetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
                // Tells persist it can stream an NDJSON response. Older runners/lambdas that
                // don't send this get a single buffered JSON response instead. Remove this
                // once we have a single code path, i.e. once runner/lambda are fully deployed
                // with the streaming-aware client.
                Accept: 'application/x-ndjson'
            },
            body: JSON.stringify({ model, activityLogId }),
            userAgent: this.userAgent
        });

        if (!response.ok) {
            const responseData = await response.text();
            return Err(new Error(`Failed to delete outdated records: ${responseData || 'Request failed with status ' + response.status}`));
        }

        let terminalLine: string | undefined;
        try {
            for await (const line of httpStreamNDJson(response)) {
                if (line.includes('"status":"done"') || line.includes('"status":"error"')) {
                    terminalLine = line;
                    break;
                }
            }
        } catch (err) {
            return Err(new Error(`Failed to delete outdated records: failed to read response: ${stringifyError(err)}`));
        }
        if (!terminalLine) {
            return Err(new Error('Failed to delete outdated records: stream ended without a terminal line'));
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(terminalLine);
        } catch (err) {
            return Err(new Error(`Failed to delete outdated records: failed to parse response: ${stringifyError(err)}`));
        }

        const result = deleteOutdatedRecordsTerminalLineSchema.safeParse(parsed);
        if (!result.success) {
            return Err(new Error(`Failed to delete outdated records: unexpected response ${terminalLine}`));
        }

        if (result.data.status === 'error') {
            return Err(new Error(`Failed to delete outdated records: ${result.data.error.message}`));
        }
        return Ok({ deletedKeys: result.data.deletedKeys });
    }

    public async getCursor({
        environmentId,
        nangoConnectionId,
        model,
        offset
    }: {
        environmentId: number;
        nangoConnectionId: number;
        model: string;
        offset: CursorOffset;
    }): Promise<Result<GetCursorSuccess>> {
        const res = await this.fetch<GetCursorSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/cursor`,
            params: {
                model,
                offset
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to get cursor: ${res.error.message}`));
        }
        return res;
    }

    public async getRecords({
        environmentId,
        nangoConnectionId,
        model,
        cursor,
        externalIds,
        limit
    }: {
        environmentId: number;
        nangoConnectionId: number;
        model: string;
        cursor?: string | undefined;
        externalIds?: string[] | undefined;
        limit?: number | undefined;
    }): Promise<Result<GetRecordsSuccess>> {
        const res = await this.fetch<GetRecordsSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/records`,
            params: {
                model,
                ...(cursor && { cursor }),
                ...(externalIds && { externalIds }),
                ...(limit !== undefined && { limit: String(limit) })
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to get records: ${res.error.message}`));
        }
        return res;
    }

    public async getCheckpoint({
        environmentId,
        nangoConnectionId,
        key
    }: {
        environmentId: number;
        nangoConnectionId: number;
        key: string;
    }): Promise<Result<GetCheckpointSuccess>> {
        const res = await this.fetch<GetCheckpointSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/checkpoint`,
            params: { key }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to get checkpoint: ${res.error.message}`));
        }
        return res;
    }

    public async putCheckpoint({
        environmentId,
        nangoConnectionId,
        key,
        checkpoint,
        expectedVersion
    }: {
        environmentId: number;
        nangoConnectionId: number;
        key: string;
        checkpoint: Checkpoint;
        expectedVersion: number;
    }): Promise<Result<PutCheckpointSuccess>> {
        const res = await this.fetch<PutCheckpointSuccess>({
            method: 'PUT',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/checkpoint`,
            data: { key, checkpoint, expectedVersion }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to save checkpoint: ${res.error.message}`));
        }
        return res;
    }

    public async deleteCheckpoint({
        environmentId,
        nangoConnectionId,
        key,
        expectedVersion
    }: {
        environmentId: number;
        nangoConnectionId: number;
        key: string;
        expectedVersion: number;
    }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'DELETE',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/checkpoint`,
            data: { key, expectedVersion }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to delete checkpoint: ${res.error.message}`));
        }
        return res;
    }

    public async postRunnerTelemetry(environmentId: number, events: RunnerTelemetry[]): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'POST',
            path: `/environment/${environmentId}/runner/telemetry`,
            data: { events }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to publish runner telemetry: ${res.error.message}`));
        }
        return res;
    }

    public async putTaskAbort({ environmentId, taskId }: { environmentId: number; taskId: string }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'PUT',
            path: `/environment/${environmentId}/runner/task/${taskId}/abort`
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to set abort flag: ${res.error.message}`));
        }
        return res;
    }

    public async getTaskAbort({ environmentId, taskId }: { environmentId: number; taskId: string }): Promise<Result<boolean>> {
        const res = await this.fetch<GetTaskAbortSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/runner/task/${taskId}/abort`
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to get abort flag: ${res.error.message}`));
        }
        return Ok(res.value.aborted);
    }

    public async putSyncConflict({
        environmentId,
        scriptType,
        syncId,
        refresh = false,
        ttlMs
    }: {
        environmentId: number;
        scriptType: 'sync';
        syncId: string;
        refresh?: boolean;
        ttlMs: number;
    }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'PUT',
            path: `/environment/${environmentId}/runner/sync-conflict`,
            data: { scriptType, syncId, refresh, ttlMs }
        });
        if (res.isErr()) {
            if (isPersistErrorCode(res.error.message, 'sync_conflict')) {
                return Err(new Error('Conflicting sync detected'));
            }
            return Err(new Error(`Failed to acquire sync conflict lock: ${res.error.message}`));
        }
        return res;
    }

    public async deleteSyncConflict({
        environmentId,
        scriptType,
        syncId
    }: {
        environmentId: number;
        scriptType: 'sync';
        syncId: string;
    }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'DELETE',
            path: `/environment/${environmentId}/runner/sync-conflict`,
            data: { scriptType, syncId }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to release sync conflict lock: ${res.error.message}`));
        }
        return res;
    }

    public async tryAcquireLock({
        environmentId,
        owner,
        key,
        ttlMs
    }: {
        environmentId: number;
        owner: string;
        key: string;
        ttlMs: number;
    }): Promise<Result<boolean>> {
        const res = await this.fetch<TryAcquireLockSuccess>({
            method: 'POST',
            path: `/environment/${environmentId}/runner/locks/try-acquire`,
            data: { owner, key, ttlMs }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to acquire lock: ${res.error.message}`));
        }
        return Ok(res.value.acquired);
    }

    public async releaseLock({ environmentId, owner, key }: { environmentId: number; owner: string; key: string }): Promise<Result<boolean>> {
        const res = await this.fetch<ReleaseLockSuccess>({
            method: 'POST',
            path: `/environment/${environmentId}/runner/locks/release`,
            data: { owner, key }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to release lock: ${res.error.message}`));
        }
        return Ok(res.value.released);
    }

    public async releaseAllLocks({ environmentId, owner }: { environmentId: number; owner: string }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'POST',
            path: `/environment/${environmentId}/runner/locks/release-all`,
            data: { owner }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to release all locks: ${res.error.message}`));
        }
        return res;
    }

    public async hasLock({ environmentId, owner, key }: { environmentId: number; owner: string; key: string }): Promise<Result<boolean>> {
        const res = await this.fetch<HasLockSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/runner/locks`,
            params: { owner, key }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to check lock: ${res.error.message}`));
        }
        return Ok(res.value.hasLock);
    }
}

function isPersistErrorCode(message: string, code: string): boolean {
    try {
        const parsed = JSON.parse(message) as { error?: { code?: string } };
        return parsed.error?.code === code;
    } catch {
        return false;
    }
}

import { getUserAgent } from '@nangohq/node';
import { getPersistAPIUrl } from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { httpFetch } from './http.js';
import { logger } from '../logger.js';

import type {
    Checkpoint,
    CursorOffset,
    DeleteOutdatedRecordsSuccess,
    DeleteRecordsSuccess,
    GetCheckpointSuccess,
    GetCursorSuccess,
    GetRecordsSuccess,
    MergingStrategy,
    PostRecordsSuccess,
    PutCheckpointSuccess,
    PutRecordsSuccess
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class PersistClient {
    private baseUrl: string;
    private secretKey: string;
    private userAgent: string;

    constructor({ secretKey }: { secretKey: string }) {
        this.secretKey = secretKey;
        this.baseUrl = getPersistAPIUrl();
        this.userAgent = getUserAgent('sdk');
    }

    private async fetch<R>({
        method,
        path,
        data,
        params
    }: {
        method: string;
        path: string;
        data?: unknown;
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

        const response = await httpFetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            body: data ? JSON.stringify(data) : null,
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
    }): Promise<Result<PostRecordsSuccess>> {
        const res = await this.fetch<PostRecordsSuccess>({
            method: 'POST',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            data: {
                model,
                records,
                providerConfigKey,
                connectionId,
                activityLogId,
                merging
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to save records: ${res.error.message}`));
        }
        return res;
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
    }): Promise<Result<PutRecordsSuccess>> {
        const res = await this.fetch<PutRecordsSuccess>({
            method: 'PUT',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            data: {
                model,
                records,
                providerConfigKey,
                connectionId,
                activityLogId,
                merging
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to update records: ${res.error.message}`));
        }
        return res;
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
    }): Promise<Result<DeleteRecordsSuccess>> {
        const res = await this.fetch<DeleteRecordsSuccess>({
            method: 'DELETE',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
            data: {
                model,
                records,
                providerConfigKey,
                connectionId,
                activityLogId,
                merging
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to delete records: ${res.error.message}`));
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
        const res = await this.fetch<{ deletedKeys: string[] }>({
            method: 'DELETE',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/outdated`,
            data: {
                model,
                activityLogId
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to delete outdated records: ${res.error.message}`));
        }
        return res;
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
        externalIds
    }: {
        environmentId: number;
        nangoConnectionId: number;
        model: string;
        cursor?: string | undefined;
        externalIds?: string[] | undefined;
    }): Promise<Result<GetRecordsSuccess>> {
        const res = await this.fetch<GetRecordsSuccess>({
            method: 'GET',
            path: `/environment/${environmentId}/connection/${nangoConnectionId}/records`,
            params: {
                model,
                ...(cursor && { cursor }),
                ...(externalIds && { externalIds })
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
}

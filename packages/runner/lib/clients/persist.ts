import { getUserAgent } from '@nangohq/node';
import { getPersistAPIUrl } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { httpFetch } from './http.js';
import { logger } from '../logger.js';

import type {
    CursorOffset,
    DeleteOutdatedRecordsSuccess,
    DeleteRecordsSuccess,
    GetCursorSuccess,
    GetRecordsSuccess,
    MergingStrategy,
    PostRecordsSuccess,
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
        url,
        data,
        params
    }: {
        method: string;
        url: string;
        data?: unknown;
        params?: Record<string, string | string[]>;
    }): Promise<Result<R>> {
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
        const fullUrl = queryString ? `${this.baseUrl}${url}?${queryString}` : `${this.baseUrl}${url}`;

        const response = await httpFetch(fullUrl, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            body: data ? JSON.stringify(data) : null,
            userAgent: this.userAgent
        });

        if (!response.ok) {
            const responseData = await response.json().catch(() => ({}));
            logger.error(`${method} ${url} failed: errorCode=${response.status} response='${JSON.stringify(responseData)}'`);
            const message =
                responseData &&
                typeof responseData === 'object' &&
                'error' in responseData &&
                responseData.error &&
                typeof responseData.error === 'object' &&
                'message' in responseData.error
                    ? String(responseData.error.message)
                    : JSON.stringify(responseData);
            return Err(new Error(message));
        }

        const responseData = await response.json().catch(() => undefined);
        return Ok(responseData as R);
    }

    public async postLog({ environmentId, data }: { environmentId: number; data: string }): Promise<Result<void>> {
        const res = await this.fetch<void>({
            method: 'POST',
            url: `/environment/${environmentId}/log`,
            data: JSON.parse(data)
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to log: ${res.error.message}`));
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/records`,
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/sync/${syncId}/job/${syncJobId}/outdated`,
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/cursor`,
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
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/records`,
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
}

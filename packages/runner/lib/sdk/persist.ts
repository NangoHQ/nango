import https from 'node:https';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios, { AxiosError, isAxiosError } from 'axios';
import { getPersistAPIUrl } from '@nangohq/shared';
import { getUserAgent } from '@nangohq/node';
import { httpRetryStrategy, retryWithBackoff, Ok, Err } from '@nangohq/utils';
import { logger } from '../logger.js';
import type { Result } from '@nangohq/utils';
import type {
    CursorOffset,
    DeleteRecordsSuccess,
    GetCursorSuccess,
    GetRecordsSuccess,
    MergingStrategy,
    PostRecordsSuccess,
    PutRecordsSuccess
} from '@nangohq/types';

export class PersistClient {
    private httpClient: AxiosInstance;
    private secretKey: string;

    constructor({ secretKey }: { secretKey: string }) {
        this.secretKey = secretKey;
        this.httpClient = axios.create({
            baseURL: getPersistAPIUrl(),
            httpsAgent: new https.Agent({ keepAlive: true }),
            headers: {
                'User-Agent': getUserAgent('sdk')
            },
            validateStatus: (_status) => {
                return true;
            }
        });
    }

    private async makeRequest<R>(requestConfig: AxiosRequestConfig): Promise<Result<R>> {
        const configWithAuth = {
            ...requestConfig,
            headers: {
                ...requestConfig.headers,
                Authorization: `Bearer ${this.secretKey}`
            }
        };
        let response: AxiosResponse;
        try {
            response = await retryWithBackoff(
                async () => {
                    return await this.httpClient(configWithAuth);
                },
                { retry: httpRetryStrategy }
            );
        } catch (err) {
            logger.error('[PersistClient] Internal error', err instanceof AxiosError ? err.code : err);
            if (isAxiosError(err)) {
                return Err(err);
            }
            return Err(new Error('Internal error', { cause: err }));
        }

        if (response.status > 299) {
            logger.error(
                `${requestConfig.method} ${requestConfig.url} failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                JSON.stringify(requestConfig)
            );
            const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
            return Err(new Error(message));
        }
        // TODO validate R
        return Ok(response.data as R);
    }

    public async saveLog({ environmentId, data }: { environmentId: number; data: string }): Promise<Result<void>> {
        const res = await this.makeRequest<void>({
            method: 'POST',
            url: `/environment/${environmentId}/log`,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json'
            },
            data
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to log: ${res.error.message}`));
        }
        return res;
    }

    public async saveRecords<T = any>({
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
        const res = await this.makeRequest<PostRecordsSuccess>({
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

    public async updateRecords<T = any>({
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
        const res = await this.makeRequest<PutRecordsSuccess>({
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
        const res = await this.makeRequest<DeleteRecordsSuccess>({
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
        const res = await this.makeRequest<GetCursorSuccess>({
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
        const res = await this.makeRequest<GetRecordsSuccess>({
            method: 'GET',
            url: `/environment/${environmentId}/connection/${nangoConnectionId}/records`,
            params: {
                model,
                cursor,
                externalIds
            }
        });
        if (res.isErr()) {
            return Err(new Error(`Failed to get records: ${res.error.message}`));
        }
        return res;
    }
}

import { Agent } from 'node:https';

import axios, { AxiosError, isAxiosError } from 'axios';

import { getUserAgent } from '@nangohq/node';
import { getPersistAPIUrl } from '@nangohq/shared';
import { Err, Ok, httpRetryStrategy, retryWithBackoff } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../logger.js';

import type {
    CursorOffset,
    DeleteRecordsSuccess,
    GetCursorSuccess,
    GetRecordsSuccess,
    MergingStrategy,
    PostRecordsSuccess,
    PutRecordsSuccess
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { Socket } from 'net';
import type { RequestOptions } from 'node:https';

export class MaxLifetimeAgent extends Agent {
    private readonly maxSocketLifetime: number;
    private readonly socketsCreatedAt: Map<Socket, number>;

    constructor(options: { maxSocketLifetimeMs: number }) {
        const lifetime = options.maxSocketLifetimeMs;

        super({
            keepAlive: true,
            timeout: lifetime
        });

        this.maxSocketLifetime = lifetime;
        this.socketsCreatedAt = new Map<Socket, number>();
    }

    public createConnection(options: RequestOptions, callback: (err: Error | null, socket: Socket) => void): Socket {
        // https://nodejs.org/docs/latest/api/http.html#agentcreateconnectionoptions-callback
        // @ts-expect-error - @types/node does not define createConnection
        const socket = super.createConnection(options, callback);

        this.socketsCreatedAt.set(socket, Date.now());
        socket.once('close', () => {
            this.socketsCreatedAt.delete(socket);
        });

        return socket;
    }

    public keepSocketAlive(socket: Socket): boolean {
        const birthTime = this.socketsCreatedAt.get(socket);

        if (birthTime) {
            const age = Date.now() - birthTime;
            if (age >= this.maxSocketLifetime) {
                return false;
            }
        }

        // https://nodejs.org/docs/latest/api/http.html#agentkeepsocketalivesocket
        // @ts-expect-error - @types/node does not define keepSocketAlive
        return super.keepSocketAlive(socket);
    }

    public override destroy(): void {
        super.destroy();
        this.socketsCreatedAt.clear();
    }
}

export class PersistClient {
    private httpClient: AxiosInstance;
    private secretKey: string;

    constructor({ secretKey }: { secretKey: string }) {
        this.secretKey = secretKey;
        this.httpClient = axios.create({
            baseURL: getPersistAPIUrl(),
            httpsAgent: new MaxLifetimeAgent({ maxSocketLifetimeMs: envs.RUNNER_PERSIST_MAX_SOCKET_MAX_LIFETIME_MS }),
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
                ...(requestConfig.headers as Record<string, string>),
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

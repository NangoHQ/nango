import type { RunnerFlags } from '.';
import type { DBSyncConfig } from '../syncConfigs/db';
import type { DBTeam } from '../team/db';
import type { AxiosError, AxiosInterceptorManager, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface NangoProps {
    scriptType: 'sync' | 'action' | 'webhook' | 'on-event';
    host?: string;
    secretKey: string;
    team: Pick<DBTeam, 'id' | 'name'>;
    connectionId: string;
    environmentId: number;
    environmentName: string;
    activityLogId: string;
    providerConfigKey: string;
    provider: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    syncVariant?: string | undefined;
    nangoConnectionId: number;
    syncJobId?: number | undefined;
    track_deletes?: boolean;
    attributes?: object | undefined;
    abortSignal?: AbortSignal;
    syncConfig: DBSyncConfig;
    runnerFlags: RunnerFlags;
    /**
     * @deprecated not used
     */
    debug: boolean;
    startedAt: Date;
    endUser: { id: number; endUserId: string | null; orgId: string | null } | null;

    axios?: {
        request?: AxiosInterceptorManager<AxiosRequestConfig>;
        response?: {
            onFulfilled: (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
            onRejected: (value: unknown) => AxiosError | Promise<AxiosError>;
        };
    };
}

export interface UserLogParameters {
    level?: 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
}

import type { NangoConnection, SyncConfig, SyncType } from '@nangohq/shared';
import type { JsonValue } from 'type-fest';

interface StartScriptPropsCommon {
    taskId: string;
    nangoConnection: NangoConnection;
    syncConfig: SyncConfig;
    provider: string;
    debug?: boolean | undefined;
}
export type StartSyncScriptProps = {
    scriptType: 'sync';
    syncId: string;
    syncJobId: number;
    syncType: SyncType.INCREMENTAL | SyncType.FULL;
} & StartScriptPropsCommon;

export type StartActionScriptProps = {
    scriptType: 'action';
    input: JsonValue;
} & StartScriptPropsCommon;

export type StartWebhookScriptProps = {
    scriptType: 'webhook';
} & StartScriptPropsCommon;

export type StartPostConnectionScriptProps = {
    scriptType: 'post-connection-script';
} & StartScriptPropsCommon;

export type StartScriptProps = StartSyncScriptProps | StartActionScriptProps | StartWebhookScriptProps | StartPostConnectionScriptProps;

import type { NangoConnection, SyncConfig, SyncType } from '@nangohq/shared';
import type { JsonValue } from 'type-fest';

interface ScriptPropsCommon {
    taskId: string;
    nangoConnection: NangoConnection;
    syncConfig: SyncConfig;
    provider: string;
    debug?: boolean | undefined;
}
export type SyncScriptProps = {
    scriptType: 'sync';
    syncId: string;
    syncJobId: number;
    syncType: SyncType.INCREMENTAL | SyncType.FULL;
} & ScriptPropsCommon;

export type ActionScriptProps = {
    scriptType: 'action';
    input: JsonValue;
} & ScriptPropsCommon;

export type WebhookScriptProps = {
    scriptType: 'webhook';
} & ScriptPropsCommon;

export type PostConnectionScriptProps = {
    scriptType: 'post-connection-script';
} & ScriptPropsCommon;

export type ScriptProps = SyncScriptProps | ActionScriptProps | WebhookScriptProps | PostConnectionScriptProps;

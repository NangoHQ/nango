import type { PostImmediate } from '../routes/v1/postImmediate.js';
import type { PostRecurring } from '../routes/v1/postRecurring.js';
import type { PostScheduleRun } from '../routes/v1/schedules/postRun.js';
import type { ScheduleState, TaskState } from '@nangohq/scheduler';
import type { ConnectionJobs } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue, SetOptional } from 'type-fest';

export type ImmediateProps = PostImmediate['Body'];
export type RecurringProps = PostRecurring['Body'];

interface SyncArgs {
    syncId: string;
    syncName: string;
    syncVariant: string;
    debug: boolean;
    connection: ConnectionJobs;
}
interface AbortArgs {
    abortedTask: {
        id: string;
        state: TaskState;
    };
    reason: string;
    connection: ConnectionJobs;
}
interface ActionArgs {
    actionName: string;
    connection: ConnectionJobs;
    activityLogId: string;
    input: JsonValue;
    async: boolean;
}
interface WebhookArgs {
    webhookName: string;
    parentSyncName: string;
    connection: ConnectionJobs;
    activityLogId: string;
    input: JsonValue;
}

interface OnEventArgs {
    onEventName: string;
    connection: ConnectionJobs;
    version: string;
    fileLocation: string;
    activityLogId: string;
    sdkVersion: string | null;
}
export type SchedulesReturn = Result<OrchestratorSchedule[]>;
export type VoidReturn = Result<void, ClientError>;
export type ExecuteProps = SetOptional<ImmediateProps, 'retry' | 'timeoutSettingsInSecs'>;
export type ExecuteReturn = Result<JsonValue, ClientError>;
export type ExecuteAsyncReturn = Result<{ taskId: string; retryKey: string }, ClientError>;
export type ExecuteActionProps = Omit<ExecuteProps, 'args'> & { args: ActionArgs };
export type ExecuteWebhookProps = Omit<ExecuteProps, 'args'> & { args: WebhookArgs };
export type ExecuteOnEventProps = Omit<ExecuteProps, 'args'> & { args: OnEventArgs };
export type ExecuteSyncProps = PostScheduleRun['Body'];

export interface OrchestratorSchedule {
    id: string;
    name: string;
    frequencyMs: number;
    state: ScheduleState;
    nextDueDate: Date | null;
}

export type OrchestratorTask = TaskSync | TaskSyncAbort | TaskAction | TaskWebhook | TaskOnEvent | TaskAbort;

interface TaskCommonFields {
    id: string;
    name: string;
    groupKey: string;
    groupMaxConcurrency: number;
    state: TaskState;
    attempt: number;
    attemptMax: number;
    ownerKey: string | null;
    retryKey: string | null;
    heartbeatTimeoutSecs: number;
}
interface TaskCommon extends TaskCommonFields {
    isSync(this: OrchestratorTask): this is TaskSync;
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isOnEvent(this: OrchestratorTask): this is TaskOnEvent;
    isSyncAbort(this: OrchestratorTask): this is TaskSyncAbort;
    isAbort(this: OrchestratorTask): this is TaskAbort;
}
export interface TaskAbort extends TaskCommon, AbortArgs {}
export function TaskAbort(props: TaskCommonFields & AbortArgs): TaskAbort {
    return {
        id: props.id,
        abortedTask: props.abortedTask,
        name: props.name,
        state: props.state,
        retryKey: props.retryKey,
        attempt: props.attempt,
        attemptMax: props.attemptMax,
        connection: props.connection,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        reason: props.reason,
        ownerKey: props.ownerKey,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => false,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => false,
        isAbort: (): this is TaskAbort => true
    };
}

export interface TaskSync extends TaskCommon, SyncArgs {}
export function TaskSync(props: TaskCommonFields & SyncArgs): TaskSync {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        retryKey: props.retryKey,
        attempt: props.attempt,
        attemptMax: props.attemptMax,
        syncId: props.syncId,
        syncName: props.syncName,
        syncVariant: props.syncVariant,
        debug: props.debug,
        connection: props.connection,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        ownerKey: props.ownerKey,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => true,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => false,
        isAbort: (): this is TaskAbort => false
    };
}

export interface TaskSyncAbort extends TaskCommon, SyncArgs, AbortArgs {}
export function TaskSyncAbort(props: TaskCommonFields & SyncArgs & AbortArgs): TaskSyncAbort {
    return {
        id: props.id,
        abortedTask: props.abortedTask,
        name: props.name,
        state: props.state,
        retryKey: props.retryKey,
        attempt: props.attempt,
        attemptMax: props.attemptMax,
        syncId: props.syncId,
        syncName: props.syncName,
        syncVariant: props.syncVariant,
        debug: props.debug,
        connection: props.connection,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        reason: props.reason,
        ownerKey: props.ownerKey,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => false,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => true,
        isAbort: (): this is TaskAbort => false
    };
}

export interface TaskAction extends TaskCommon, ActionArgs {}
export function TaskAction(props: TaskCommonFields & ActionArgs): TaskAction {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        attempt: props.attempt,
        retryKey: props.retryKey,
        attemptMax: props.attemptMax,
        actionName: props.actionName,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        ownerKey: props.ownerKey,
        async: props.async,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => false,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => true,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => false,
        isAbort: (): this is TaskAbort => false
    };
}

export interface TaskWebhook extends TaskCommon, WebhookArgs {}
export function TaskWebhook(props: TaskCommonFields & WebhookArgs): TaskWebhook {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        retryKey: props.retryKey,
        attempt: props.attempt,
        attemptMax: props.attemptMax,
        webhookName: props.webhookName,
        parentSyncName: props.parentSyncName,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        ownerKey: props.ownerKey,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => false,
        isWebhook: (): this is TaskWebhook => true,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => false,
        isAbort: (): this is TaskAbort => false
    };
}

export interface TaskOnEvent extends TaskCommon, OnEventArgs {}
export function TaskOnEvent(props: TaskCommonFields & OnEventArgs): TaskOnEvent {
    return {
        id: props.id,
        state: props.state,
        name: props.name,
        retryKey: props.retryKey,
        attempt: props.attempt,
        attemptMax: props.attemptMax,
        onEventName: props.onEventName,
        version: props.version,
        connection: props.connection,
        fileLocation: props.fileLocation,
        sdkVersion: props.sdkVersion,
        activityLogId: props.activityLogId,
        groupKey: props.groupKey,
        groupMaxConcurrency: props.groupMaxConcurrency,
        ownerKey: props.ownerKey,
        heartbeatTimeoutSecs: props.heartbeatTimeoutSecs,
        isSync: (): this is TaskSync => false,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => true,
        isSyncAbort: (): this is TaskSyncAbort => false,
        isAbort: (): this is TaskAbort => false
    };
}

export interface ClientError extends Error {
    name: string;
    payload: JsonValue;
    additional_properties?: Record<string, JsonValue>;
}

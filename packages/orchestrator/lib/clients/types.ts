import type { JsonValue, SetOptional } from 'type-fest';
import type { PostSchedule } from '../routes/v1/postSchedule.js';
import type { Result } from '@nangohq/utils';
import type { TaskState } from '@nangohq/scheduler';

export type SchedulingProps = Omit<PostSchedule['Body'], 'scheduling'>;

export interface ActionArgs {
    name: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: number;
    input: JsonValue;
}
export interface WebhookArgs {
    name: string;
    parentSyncName: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: number | null;
    input: JsonValue;
}

export interface PostConnectionArgs {
    name: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    fileLocation: string;
    activityLogId: number;
}

export type ExecuteProps = SetOptional<SchedulingProps, 'retry' | 'timeoutSettingsInSecs'>;
export type ExecuteReturn = Result<JsonValue, ClientError>;
export type ExecuteActionProps = Omit<ExecuteProps, 'args'> & { args: ActionArgs };
export type ExecuteWebhookProps = Omit<ExecuteProps, 'args'> & { args: WebhookArgs };
export type ExecutePostConnectionProps = Omit<ExecuteProps, 'args'> & { args: PostConnectionArgs };

export type OrchestratorTask = TaskAction | TaskWebhook | TaskPostConnection;

export interface TaskAction extends ActionArgs {
    id: string;
    state: TaskState;
    abortController: AbortController;
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isPostConnection(this: OrchestratorTask): this is TaskPostConnection;
}
export function TaskAction(props: {
    id: string;
    state: TaskState;
    name: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: number;
    input: JsonValue;
}): TaskAction {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        abortController: new AbortController(),
        isWebhook: () => false,
        isAction: () => true,
        isPostConnection: () => false
    };
}

export interface TaskWebhook extends WebhookArgs {
    id: string;
    state: TaskState;
    abortController: AbortController;
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isPostConnection(this: OrchestratorTask): this is TaskPostConnection;
}
export function TaskWebhook(props: {
    id: string;
    state: TaskState;
    name: string;
    parentSyncName: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: number | null;
    input: JsonValue;
}): TaskWebhook {
    return {
        id: props.id,
        state: props.state,
        name: props.name,
        parentSyncName: props.parentSyncName,
        connection: props.connection,
        activityLogId: props.activityLogId,
        input: props.input,
        abortController: new AbortController(),
        isWebhook: () => true,
        isAction: () => false,
        isPostConnection: () => false
    };
}

export interface TaskPostConnection extends PostConnectionArgs {
    id: string;
    state: TaskState;
    abortController: AbortController;
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isPostConnection(this: OrchestratorTask): this is TaskPostConnection;
}
export function TaskPostConnection(props: {
    id: string;
    state: TaskState;
    name: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
    };
    fileLocation: string;
    activityLogId: number;
}): TaskPostConnection {
    return {
        id: props.id,
        state: props.state,
        name: props.name,
        connection: props.connection,
        fileLocation: props.fileLocation,
        activityLogId: props.activityLogId,
        abortController: new AbortController(),
        isWebhook: () => false,
        isAction: () => false,
        isPostConnection: () => true
    };
}

export interface ClientError extends Error {
    name: string;
    payload: JsonValue;
}

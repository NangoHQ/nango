import type { JsonValue, SetOptional } from 'type-fest';
import type { PostSchedule } from '../routes/v1/postSchedule.js';
import type { Result } from '@nangohq/utils';
import type { TaskState } from '@nangohq/scheduler';

export type SchedulingProps = Omit<PostSchedule['Body'], 'scheduling'>;

interface ActionArgs {
    actionName: string;
    connection: {
        id: number;
        provider_config_key: string;
        environment_id: number;
        connection_id: string;
    };
    activityLogId: number;
    input: JsonValue;
}
interface WebhookArgs {
    webhookName: string;
    parentSyncName: string;
    connection: {
        id: number;
        connection_id: string;
        provider_config_key: string;
        environment_id: number;
    };
    activityLogId: number;
    input: JsonValue;
}

interface PostConnectionArgs {
    postConnectionName: string;
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

interface TaskCommonFields {
    id: string;
    name: string;
    state: TaskState;
}
interface TaskCommon extends TaskCommonFields {
    isWebhook(this: OrchestratorTask): this is TaskWebhook;
    isAction(this: OrchestratorTask): this is TaskAction;
    isPostConnection(this: OrchestratorTask): this is TaskPostConnection;
    abortController: AbortController;
}

export interface TaskAction extends TaskCommon, ActionArgs {}
export function TaskAction(props: TaskCommonFields & ActionArgs): TaskAction {
    return {
        id: props.id,
        name: props.name,
        actionName: props.actionName,
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

export interface TaskWebhook extends TaskCommon, WebhookArgs {}
export function TaskWebhook(props: TaskCommonFields & WebhookArgs): TaskWebhook {
    return {
        id: props.id,
        name: props.name,
        state: props.state,
        webhookName: props.webhookName,
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

export interface TaskPostConnection extends TaskCommon, PostConnectionArgs {}
export function TaskPostConnection(props: TaskCommonFields & PostConnectionArgs): TaskPostConnection {
    return {
        id: props.id,
        state: props.state,
        name: props.name,
        postConnectionName: props.postConnectionName,
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

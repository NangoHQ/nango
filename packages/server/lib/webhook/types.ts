import type { InternalNango } from './internal-nango.js';
import type { Result } from '@nangohq/utils';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    headers: Record<string, string>,
    body: T,
    rawBody: string
) => Promise<Result<WebhookResponse>>;

export interface WebhookResponseOnly {
    content: string | Record<string, any> | null;
    statusCode: number;
}

export interface WebhookResponseWithConnectionIds extends WebhookResponseOnly {
    connectionIds: string[];
}

export interface WebhookResponseWithForward extends WebhookResponseWithConnectionIds {
    toForward: unknown;
}

export interface WebhookResponseNoContent {
    content: null;
    statusCode: 204;
}

export type WebhookResponse = WebhookResponseOnly | WebhookResponseWithConnectionIds | WebhookResponseWithForward | WebhookResponseNoContent;

export type WebhookHandlersMap = Record<string, WebhookHandler>;

export interface AirtableWebhookReference {
    base: {
        id: string;
    };
    webhook: {
        id: string;
    };
    timestamp: string;
}

export interface SentryOauthWebhookResponse {
    action: string;
    installation: {
        uuid: string;
    };
    data: {
        installation: {
            app: {
                uuid: string;
                slug: string;
            };
            organization: {
                slug: string;
                id: number;
            };
            uuid: string;
            status: string;
            code: string;
        };
    };
    actor: {
        type: string;
        id: number;
        name: string;
    };
}

interface AttioWebhookEvent {
    event_type:
        | 'record.created'
        | 'record.updated'
        | 'record.deleted'
        | 'record.merged'
        | 'object-attribute.created'
        | 'object-attribute.updated'
        | 'list-entry.created'
        | 'list-entry.deleted'
        | 'list-attribute.created'
        | 'list-attribute.updated'
        | 'list.created'
        | 'list.updated'
        | 'list.deleted'
        | 'note.created'
        | 'note.updated'
        | 'note-content.updated'
        | 'task.created'
        | 'task.updated'
        | 'task.deleted'
        | 'comment.created'
        | 'comment.resolved'
        | 'comment.unresolved'
        | 'comment.deleted'
        | 'workspace-member.created';

    id: {
        workspace_id: string;
        object_id?: string;
        record_id?: string;
        attribute_id?: string;
        list_id?: string;
        entry_id?: string;
        note_id?: string;
        task_id?: string;
        comment_id?: string;
        workspace_member_id?: string;
    };
    actor: {
        type: string;
        id: string;
    };
    duplicate_object_id?: string;
    duplicate_record_id?: string;
    parent_object_id?: string;
    parent_record_id?: string;
    thread_id?: string;
}

export interface AttioWebhook {
    webhook_id: string;
    events: AttioWebhookEvent[];
}

export interface HubSpotWebhook {
    objectId: number;
    propertyName?: string;
    propertyValue?: string;
    changeSource?: string;
    eventId: number;
    subscriptionId: number;
    portalId: number;
    appId?: number;
    occurredAt: number;
    subscriptionType: string;
    attemptNumber: number;
    messageId?: string;
    messageType?: 'MESSAGE' | 'COMMENT';
    primaryObjectId?: string;
    mergedObjectIds?: string[];
    newObjectId?: string;
    numberOfPropertiesMoved?: number;
    sourceId?: string;
    changeFlag?: string;
}

export interface jobdivaWebhookResponse {
    type: 'activity' | 'contact' | 'job' | 'candidate' | 'company';
    operation: 'Insert' | 'Update' | 'delete';
    id: string;
    data: any[];
}

export interface HighLevelWebhookResponse {
    type?: string;
    companyId?: string;
    locationId?: string;
    altId?: string;
    altType?: string;
}

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

export interface NotionWebhook {
    id: string;
    timestamp: string;
    workspace_id: string;
    subscription_id: string;
    integration_id: string;
    type: string;
    authors: {
        id: string;
        type: 'person' | 'bot' | 'agent';
    }[];
    accessible_by?: {
        id: string;
        type: 'person' | 'bot';
    }[]; // only for public integrations
    attempt_number: number;
    entity: {
        id: string;
        type: 'page' | 'block' | 'database';
    };
    data: Record<string, any>;
}

export interface NotionWebhookVerification {
    verification_token: string;
}

type AffinityEventType =
    | 'list.created'
    | 'list.updated'
    | 'list.deleted'
    | 'list_entry.created'
    | 'list_entry.deleted'
    | 'note.created'
    | 'note.updated'
    | 'note.deleted'
    | 'field.created'
    | 'field.updated'
    | 'field.deleted'
    | 'field_value.created'
    | 'field_value.updated'
    | 'field_value.deleted'
    | 'person.created'
    | 'person.updated'
    | 'person.deleted'
    | 'organization.created'
    | 'organization.updated'
    | 'organization.deleted'
    | 'organization.merged'
    | 'opportunity.created'
    | 'opportunity.updated'
    | 'opportunity.deleted'
    | 'file.created'
    | 'file.deleted'
    | 'reminder.created'
    | 'reminder.updated'
    | 'reminder.deleted';

export interface affinityWebhookResponse {
    type: AffinityEventType;
    body: object;
    sent_at: number;
}

export interface PagerDutyWebhookPayload {
    event: {
        id: string;
        event_type: string;
        resource_type: string;
        occurred_at: string;
        agent: object | null;
        client: object | null;
        data: object;
    };
}

export interface ConnectWisePsaWebhookPayload {
    MessageId?: string;
    FromUrl?: string;
    CompanyId?: string;
    MemberId?: string;
    Action?: string;
    Type?: string;
    ID?: number;
    ProductInstanceId?: string;
    PartnerId?: string;
    Entity?: string | Record<string, any>;
    Metadata?: {
        key_url?: string;
    };
    CallbackObjectRecId?: number;
    [key: string]: any;
}

export interface ShipStationWebhook {
    resource_url: string;
    resource_type: string;
}

export interface SellsyWebhookPayload {
    eventType: string;
    relatedtype: string;
    ownertype: string;
    timestamp: string;
    event: string;
    ownerid: string;
    relatedid: string;
    thirdtype?: string;
    corpid: string;
    relatedobject: Record<string, any>;
    individual: boolean;
}

interface CalendarInvitee {
    name: string | null;
    email: string | null;
    email_domain: string | null;
    is_external: boolean;
    matched_speaker_display_name?: string | null;
}

interface RecordedBy {
    name: string;
    email: string;
    email_domain: string;
    team: string | null;
}

interface Speaker {
    display_name: string;
    matched_calendar_invitee_email: string | null;
}

interface TranscriptEntry {
    speaker: Speaker;
    text: string;
    timestamp: string;
}

interface DefaultSummary {
    template_name: string | null;
    markdown_formatted: string | null;
}

interface Assignee {
    name: string | null;
    email: string | null;
    team: string | null;
}

interface ActionItem {
    description: string;
    user_generated: boolean;
    completed: boolean;
    recording_timestamp: string;
    recording_playback_url: string;
    assignee: Assignee;
}

interface CRMContact {
    name: string;
    email: string;
    record_url: string;
}

interface CRMCompany {
    name: string;
    record_url: string;
}

interface CRMDeal {
    name: string;
    amount: number;
    record_url: string;
}

interface CRMMatches {
    contacts: CRMContact[];
    companies: CRMCompany[];
    deals: CRMDeal[];
    error: string | null;
}

export interface FathomWebhookResponse {
    title: string;
    meeting_title: string | null;
    recording_id: number;
    url: string;
    share_url: string;
    created_at: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    recording_start_time: string;
    recording_end_time: string;
    calendar_invitees_domains_type: 'only_internal' | 'one_or_more_external';
    transcript_language: string;
    calendar_invitees: CalendarInvitee[];
    recorded_by: RecordedBy;
    transcript: TranscriptEntry[] | null;
    default_summary?: DefaultSummary;
    action_items: ActionItem[] | null;
    crm_matches?: CRMMatches;
}

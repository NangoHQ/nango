import type { InternalNango } from './internal-nango.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { Result } from '@nangohq/utils';

export type WebhookHandler<T = any> = (
    internalNango: InternalNango,
    integration: ProviderConfig,
    headers: Record<string, string>,
    body: T,
    rawBody: string,
    logContextGetter: LogContextGetter
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

// fathom currently supports only new meeting content ready
// https://docs.fathom.ai/api-reference/webhook-payloads/new-meeting
export interface FathomWeebhook {
    title: string;
    meeting_title: string;
    url: string;
    share_url: string;
    created_at: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    recording_start_time: string;
    recording_end_time: string;
    meeting_type: 'internal' | 'external';
    transcript_language: string;
    calendar_invitees: CalendarInvitee[];
    recorded_by: RecordedBy;
    transcript: Transcript[];
    default_summary: DefaultSummary;
    action_items: ActionItem[];
    crm_matches: CrmMatches;
}

interface CalendarInvitee {
    is_external: boolean;
    name?: string;
    matched_speaker_display_name?: string;
    email?: string;
}

interface RecordedBy {
    name: string;
    email: string;
    team?: string;
}

interface Transcript {
    speaker: Speaker;
    text: string;
    timestamp: string;
}

interface Speaker {
    display_name: string;
    matched_calendar_invitee_email?: string;
}

interface DefaultSummary {
    template_name?: string;
    markdown_formatted?: string;
}

interface ActionItem {
    description: string;
    user_generated: boolean;
    completed: boolean;
    recording_timestamp: string;
    recording_playback_url: string;
    assignee: Assignee;
}

interface Assignee {
    name?: string;
    email?: string;
    team?: string;
}

interface CrmMatches {
    contacts: Contact[];
    companies: Company[];
    deals: Deal[];
    error?: string;
}

interface Contact {
    name: string;
    email: string;
    record_url: string;
}

interface Company {
    name: string;
    record_url: string;
}

interface Deal {
    name: string;
    amount: number;
    record_url: string;
}
